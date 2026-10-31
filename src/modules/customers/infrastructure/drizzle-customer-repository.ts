import { eq, and, or, ilike } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { customers } from './customers.schema';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { Money } from '@/shared/domain/money';

function toDomain(row: typeof customers.$inferSelect): Customer {
  return new Customer({
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    phone: row.phone,
    creditLimit: Money.fromDecimal(row.creditLimit),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCustomerRepository implements CustomerRepository {
  async save(customer: Customer): Promise<void> {
    await db
      .insert(customers)
      .values({
        id: customer.id,
        merchantId: customer.merchantId,
        name: customer.name,
        phone: customer.phone,
        creditLimit: customer.creditLimit.toDecimal(),
        active: customer.active,
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
          updatedAt: customer.updatedAt,
        },
      });
  }

  async findById(merchantId: string, customerId: string): Promise<Customer | null> {
    const [row] = await db
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
    const [row] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.phone, normalizedPhone)
        )
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findAllActive(merchantId: string): Promise<Customer[]> {
    const rows = await db
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

  async search(merchantId: string, query: string): Promise<Customer[]> {
    const trimmed = query.trim();
    const searchPattern = `%${trimmed}%`;

    const rows = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          or(
            ilike(customers.name, searchPattern),
            ilike(customers.phone, searchPattern)
          )
        )
      )
      .orderBy(customers.name)
      .limit(50);

    return rows.map(toDomain);
  }
}
