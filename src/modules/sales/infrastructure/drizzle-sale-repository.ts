import { eq, and, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import * as schema from '@/shared/infrastructure/db/schema';
import { sales, saleItems, payments } from './sales.schema';
import { Sale, SaleStatus } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment, PaymentMethod, PaymentStatus } from '../domain/payment';
import { CreditDebitCommit, SaleCommit, SaleRepository } from '../domain/sale-repository.port';
import { cashMovements, cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { CashSessionNotOpenError } from '../domain/errors';
import { isProductUnit } from '@/shared/domain/product-unit';
import { Money } from '@/shared/domain/money';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';

export type SaleDatabase = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

function toDomain(
  saleRow: typeof sales.$inferSelect,
  itemsRows: (typeof saleItems.$inferSelect)[],
  paymentRows: (typeof payments.$inferSelect)[]
): Sale {
  const items = itemsRows.map(
    (item) =>
      new SaleItem({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        unitPrice: Money.fromDecimal(item.unitPrice),
        quantity: item.quantity,
        unit: isProductUnit(item.unit) ? item.unit : 'UN',
      })
  );

  const paymentEntities = paymentRows.map(
    (p) =>
      new Payment({
        id: p.id,
        method: p.method as PaymentMethod,
        amount: Money.fromDecimal(p.amount),
        receivedAmount: Money.fromDecimal(p.receivedAmount ?? p.amount),
        changeAmount: Money.fromDecimal(p.changeAmount ?? '0'),
        status: p.status as PaymentStatus,
        installments: p.installments,
        externalReference: p.externalReference,
      })
  );

  return new Sale({
    id: saleRow.id,
    merchantId: saleRow.merchantId,
    cashSessionId: saleRow.cashSessionId,
    operatorId: saleRow.operatorId,
    status: saleRow.status as SaleStatus,
    items,
    payments: paymentEntities,
    discountAmount: Money.fromDecimal(saleRow.discountAmount ?? '0'),
    idempotencyKey: saleRow.idempotencyKey,
    stockTracked: saleRow.stockTracked,
    createdAt: saleRow.createdAt,
    updatedAt: saleRow.updatedAt,
  });
}

export class DrizzleSaleRepository implements SaleRepository {
  constructor(private readonly database: SaleDatabase = db) {}

  async save(sale: Sale): Promise<void> {
    await this.database.transaction((tx) => this.writeSale(tx, sale));
  }

  async commitSale(commit: SaleCommit): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.ensureCashSessionOpen(tx, commit.sale.merchantId, commit.sale.cashSessionId);
      await this.writeSale(tx, commit.sale);
      await this.applyStockDeductions(tx, commit);
      if (commit.creditDebit) {
        await this.applyCreditDebit(tx, commit.sale.merchantId, commit.creditDebit);
      }
      if (commit.cashReceipt) {
        await tx.insert(cashMovements).values({
          merchantId: commit.sale.merchantId,
          cashSessionId: commit.cashReceipt.cashSessionId,
          movementType: 'SALE_RECEIPT',
          amount: commit.cashReceipt.amount.toDecimal(),
          saleId: commit.sale.id,
        });
      }
      for (const audit of commit.audits) {
        await tx.insert(auditEvents).values(toAuditEventRow(commit.sale.merchantId, audit));
      }
    });
  }

  /**
   * The session was open when the use case read it, but it may have been closed since.
   * FOR SHARE makes a concurrent close wait until this sale commits, so a sale never lands
   * in a closed session and the blind close sees every receipt.
   */
  private async ensureCashSessionOpen(tx: SaleDatabase, merchantId: string, cashSessionId: string): Promise<void> {
    const [session] = await tx
      .select({ status: cashSessions.status })
      .from(cashSessions)
      .where(and(eq(cashSessions.merchantId, merchantId), eq(cashSessions.id, cashSessionId)))
      .for('share');
    if (session?.status !== 'OPEN') {
      throw new CashSessionNotOpenError(cashSessionId);
    }
  }

  private async applyStockDeductions(tx: SaleDatabase, commit: SaleCommit): Promise<void> {
    const { merchantId } = commit.sale;
    // Lock in a fixed code-unit order so concurrent sales with overlapping products cannot deadlock.
    // localeCompare is avoided: its order depends on the runtime locale.
    const ordered = [...commit.stockDeductions].sort((a, b) =>
      a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0
    );
    for (const deduction of ordered) {
      if (!Number.isInteger(deduction.quantity) || deduction.quantity <= 0) {
        throw new Error(`Stock deduction quantity must be a positive integer, got ${deduction.quantity}.`);
      }
      const [row] = await tx
        .select({ available: inventoryItems.availableQuantity })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, deduction.productId)))
        .for('update');
      const available = row?.available ?? 0;
      if (available < deduction.quantity) {
        throw new InsufficientStockError(deduction.productId, available, deduction.quantity);
      }

      await tx
        .update(inventoryItems)
        .set({ availableQuantity: available - deduction.quantity, updatedAt: new Date() })
        .where(and(eq(inventoryItems.merchantId, merchantId), eq(inventoryItems.productId, deduction.productId)));

      await tx.insert(inventoryMovements).values({
        merchantId,
        productId: deduction.productId,
        movementType: 'SALE',
        quantity: deduction.quantity,
        reason: `Venda ${commit.sale.id}`,
        actorId: commit.actorId,
      });
    }
  }

  private async applyCreditDebit(tx: SaleDatabase, merchantId: string, credit: CreditDebitCommit): Promise<void> {
    // Lock the customer row so concurrent credit sales read the balance in order.
    await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.id, credit.customerId)))
      .for('update');

    const [totals] = await tx
      .select({
        totalDebits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'DEBIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
        totalCredits: sql<string>`coalesce(sum(case when ${customerCreditLedger.type} = 'CREDIT' then ${customerCreditLedger.amount} else 0 end), 0)`,
      })
      .from(customerCreditLedger)
      .where(
        and(
          eq(customerCreditLedger.merchantId, merchantId),
          eq(customerCreditLedger.customerId, credit.customerId)
        )
      );

    const rawDebt = Money.fromDecimal(totals?.totalDebits ?? '0').subtract(
      Money.fromDecimal(totals?.totalCredits ?? '0')
    );
    await credit.ensureWithinLimit(rawDebt.isNegative() ? Money.zero() : rawDebt);

    const movement = credit.movement;
    await tx.insert(customerCreditLedger).values({
      id: movement.id,
      merchantId: movement.merchantId,
      customerId: movement.customerId,
      type: movement.type,
      amount: movement.amount.toDecimal(),
      saleId: movement.saleId ?? null,
      cashSessionId: movement.cashSessionId ?? null,
      operatorId: movement.operatorId,
      authorizedBy: movement.authorizedBy ?? null,
      note: movement.note ?? null,
      createdAt: movement.createdAt,
    });
  }

  private async writeSale(tx: SaleDatabase, sale: Sale): Promise<void> {
    await tx
      .insert(sales)
      .values({
        id: sale.id,
        merchantId: sale.merchantId,
        cashSessionId: sale.cashSessionId,
        operatorId: sale.operatorId,
        status: sale.status,
        subtotal: sale.subtotal.toDecimal(),
        discountAmount: sale.discountAmount.toDecimal(),
        total: sale.total.toDecimal(),
        cashReceived: sale.cashReceived.toDecimal(),
        changeAmount: sale.changeAmount.toDecimal(),
        idempotencyKey: sale.idempotencyKey,
        stockTracked: sale.stockTracked,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
      })
      .onConflictDoUpdate({
        target: [sales.id],
        set: {
          status: sale.status,
          subtotal: sale.subtotal.toDecimal(),
          discountAmount: sale.discountAmount.toDecimal(),
          total: sale.total.toDecimal(),
          cashReceived: sale.cashReceived.toDecimal(),
          changeAmount: sale.changeAmount.toDecimal(),
          updatedAt: sale.updatedAt,
        },
      });

    await tx
      .delete(saleItems)
      .where(
        and(
          eq(saleItems.merchantId, sale.merchantId),
          eq(saleItems.saleId, sale.id)
        )
      );

    if (sale.items.length > 0) {
      await tx.insert(saleItems).values(
        sale.items.map((item) => ({
          id: item.id,
          merchantId: sale.merchantId,
          saleId: sale.id,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice.toDecimal(),
          quantity: item.quantity,
          unit: item.unit,
          subtotal: item.subtotal.toDecimal(),
          createdAt: sale.createdAt,
        }))
      );
    }

    await tx
      .delete(payments)
      .where(
        and(
          eq(payments.merchantId, sale.merchantId),
          eq(payments.saleId, sale.id)
        )
      );

    if (sale.payments.length > 0) {
      await tx.insert(payments).values(
        sale.payments.map((p) => ({
          id: p.id,
          merchantId: sale.merchantId,
          saleId: sale.id,
          method: p.method,
          status: p.status,
          amount: p.amount.toDecimal(),
          receivedAmount: p.receivedAmount.toDecimal(),
          changeAmount: p.changeAmount.toDecimal(),
          installments: p.installments,
          externalReference: p.externalReference,
          createdAt: sale.createdAt,
        }))
      );
    }
  }

  async findById(merchantId: string, id: string): Promise<Sale | null> {
    const [saleRow] = await this.database
      .select()
      .from(sales)
      .where(and(eq(sales.merchantId, merchantId), eq(sales.id, id)))
      .limit(1);

    return saleRow ? this.loadSaleDetails(merchantId, saleRow) : null;
  }

  async findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null> {
    if (!idempotencyKey?.trim()) {
      return null;
    }

    const [saleRow] = await this.database
      .select()
      .from(sales)
      .where(
        and(
          eq(sales.merchantId, merchantId),
          eq(sales.idempotencyKey, idempotencyKey.trim())
        )
      )
      .limit(1);

    return saleRow ? this.loadSaleDetails(merchantId, saleRow) : null;
  }

  private async loadSaleDetails(
    merchantId: string,
    saleRow: typeof sales.$inferSelect
  ): Promise<Sale> {
    const [itemsRows, paymentRows] = await Promise.all([
      this.database
        .select()
        .from(saleItems)
        .where(
          and(
            eq(saleItems.merchantId, merchantId),
            eq(saleItems.saleId, saleRow.id)
          )
        ),
      this.database
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.merchantId, merchantId),
            eq(payments.saleId, saleRow.id)
          )
        ),
    ]);

    return toDomain(saleRow, itemsRows, paymentRows);
  }
}
