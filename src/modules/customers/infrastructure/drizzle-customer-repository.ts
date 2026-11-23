import { eq, ne, and, or, ilike, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import * as schema from '@/shared/infrastructure/db/schema';
import { customers, customerCreditLedger } from './customers.schema';
import { Customer } from '../domain/customer';
import { CustomerChanges, CustomerRepository, CustomerUpdateContext } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, CustomerChangedError, CustomerHasDebtError, CustomerPhoneInactiveError, OWNER_PIN_REQUIRED_TO_DELETE, OwnerPinRequiredError } from '../domain/errors';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';
import { phoneDigits } from '../domain/phone';
import { Money } from '@/shared/domain/money';

export type CustomerDatabase = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Legacy rows may hold a mask, so phones are also compared by their digits (D-21).
const storedDigits = sql`regexp_replace(${customers.phone}, '\\D', '', 'g')`;

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function toDomain(row: typeof customers.$inferSelect): Customer {
  return new Customer({
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    phone: row.phone,
    creditLimit: Money.fromDecimal(row.creditLimit),
    active: row.active,
    creditBlocked: row.creditBlocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly database: CustomerDatabase = db) {}

  async save(customer: Customer): Promise<void> {
    try {
      await this.insertOrUpdate(customer);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CustomerAlreadyExistsError(customer.phone);
      }
      throw error;
    }
  }

  private async insertOrUpdate(customer: Customer): Promise<void> {
    await this.database
      .insert(customers)
      .values({
        id: customer.id,
        merchantId: customer.merchantId,
        name: customer.name,
        phone: customer.phone,
        creditLimit: customer.creditLimit.toDecimal(),
        active: customer.active,
        creditBlocked: customer.creditBlocked,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })
      .onConflictDoUpdate({
        target: [customers.id],
        set: {
          name: customer.name,
          phone: customer.phone,
          creditLimit: customer.creditLimit.toDecimal(),
          active: customer.active,
          creditBlocked: customer.creditBlocked,
          updatedAt: customer.updatedAt,
        },
      });
  }

  async updateDetails(
    merchantId: string,
    customerId: string,
    changes: CustomerChanges,
    { actorId, expectedUpdatedAt, authorizedBy }: CustomerUpdateContext
  ): Promise<Customer | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const where = and(eq(customers.merchantId, merchantId), eq(customers.id, customerId));
        const [locked] = await tx.select().from(customers).where(where).for('update');
        if (!locked) return null;

        const before = toDomain(locked);
        if (expectedUpdatedAt && expectedUpdatedAt.getTime() !== before.updatedAt.getTime()) {
          throw new CustomerChangedError();
        }

        const after = before.withChanges(changes);
        const diff = before.changesTo(after);
        if (Object.keys(diff).length === 0) return before;

        // D-22: the increase is judged against the limit read under the lock, so a concurrent edit cannot slip past the PIN.
        const isIncrease = after.creditLimit.isGreaterThan(before.creditLimit);
        if (isIncrease && !authorizedBy) throw new OwnerPinRequiredError();

        // D-27: excluding needs the owner PIN (judged on the state read under the lock) and zero debt, read under the same lock
        // so a credit sale cannot slip in between.
        const isExclusion = before.active && !after.active;
        if (isExclusion && !authorizedBy) throw new OwnerPinRequiredError(OWNER_PIN_REQUIRED_TO_DELETE);
        if (isExclusion) {
          const debt = await this.debtOf(tx, merchantId, customerId);
          if (debt.isPositive()) throw new CustomerHasDebtError(debt);
        }

        if (diff.phone) {
          const [other] = await tx
            .select({ id: customers.id, active: customers.active })
            .from(customers)
            .where(
              and(
                eq(customers.merchantId, merchantId),
                ne(customers.id, customerId),
                or(eq(customers.phone, after.phone), sql`${storedDigits} = ${phoneDigits(after.phone)}`)
              )
            )
            .limit(1);
          if (other) throw other.active ? new CustomerAlreadyExistsError(after.phone) : new CustomerPhoneInactiveError(after.phone);
        }

        const [row] = await tx
          .update(customers)
          .set({
            ...(diff.name && { name: after.name }),
            ...(diff.phone && { phone: after.phone }),
            ...(diff.creditLimit && { creditLimit: after.creditLimit.toDecimal() }),
            ...(diff.creditBlocked && { creditBlocked: after.creditBlocked }),
            ...(diff.active && { active: after.active }),
            // Strictly greater than the previous value, in whole milliseconds (the precision of expectedUpdatedAt).
            updatedAt: sql`GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', ${customers.updatedAt}) + interval '1 millisecond')`,
          })
          .where(where)
          .returning();

        await tx.insert(auditEvents).values(
          toAuditEventRow(merchantId, {
            eventType: 'CUSTOMER_UPDATED',
            actorId,
            aggregateType: 'CUSTOMER',
            aggregateId: customerId,
            details: { changes: diff, ...((isIncrease || isExclusion) && { authorizedBy }) },
          })
        );

        return toDomain(row);
      });
    } catch (error) {
      // A race on the unique index (merchant, phone) is the same domain conflict, without the driver text.
      if (isUniqueViolation(error)) throw new CustomerAlreadyExistsError(changes.phone ?? '');
      throw error;
    }
  }

  /** Ledger debt (debits minus credits, never below zero), the same sum as the sale and the settlement. */
  private async debtOf(tx: CustomerDatabase, merchantId: string, customerId: string): Promise<Money> {
    const [totals] = await tx
      .select({
        totalDebits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'DEBIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
        totalCredits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'CREDIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
      })
      .from(customerCreditLedger)
      .where(and(eq(customerCreditLedger.merchantId, merchantId), eq(customerCreditLedger.customerId, customerId)));
    const raw = Money.fromDecimal(totals?.totalDebits ?? '0').subtract(Money.fromDecimal(totals?.totalCredits ?? '0'));
    return raw.isNegative() ? Money.zero() : raw;
  }

  async findById(merchantId: string, customerId: string): Promise<Customer | null> {
    const [row] = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.id, customerId)
        )
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByPhone(merchantId: string, phone: string): Promise<Customer | null> {
    const normalizedPhone = phone.trim();
    const digits = phoneDigits(normalizedPhone);
    const [row] = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          digits
            ? or(eq(customers.phone, normalizedPhone), sql`${storedDigits} = ${digits}`)
            : eq(customers.phone, normalizedPhone)
        )
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findAllActive(merchantId: string): Promise<Customer[]> {
    const rows = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.active, true)
        )
      )
      .orderBy(customers.name);

    return rows.map(toDomain);
  }

  async findAllInactive(merchantId: string): Promise<Customer[]> {
    const rows = await this.database
      .select()
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.active, false)))
      .orderBy(customers.name);

    return rows.map(toDomain);
  }

  async search(merchantId: string, query: string): Promise<Customer[]> {
    const trimmed = query.trim();
    const searchPattern = `%${trimmed}%`;
    const digits = phoneDigits(trimmed);

    const rows = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.active, true),
          or(
            ilike(customers.name, searchPattern),
            ilike(customers.phone, searchPattern),
            digits ? sql`${storedDigits} like ${`%${digits}%`}` : undefined
          )
        )
      )
      .orderBy(customers.name)
      .limit(50);

    return rows.map(toDomain);
  }
}
