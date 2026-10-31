import { eq, and } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { sales, saleItems, payments } from './sales.schema';
import { Sale, SaleStatus } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment, PaymentMethod, PaymentStatus } from '../domain/payment';
import { SaleRepository } from '../domain/sale-repository.port';
import { Money } from '@/shared/domain/money';

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
    createdAt: saleRow.createdAt,
    updatedAt: saleRow.updatedAt,
  });
}

export class DrizzleSaleRepository implements SaleRepository {
  async save(sale: Sale): Promise<void> {
    await db.transaction(async (tx) => {
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
    });
  }

  async findById(merchantId: string, id: string): Promise<Sale | null> {
    const [saleRow] = await db
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

    const [saleRow] = await db
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
      db
        .select()
        .from(saleItems)
        .where(
          and(
            eq(saleItems.merchantId, merchantId),
            eq(saleItems.saleId, saleRow.id)
          )
        ),
      db
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
