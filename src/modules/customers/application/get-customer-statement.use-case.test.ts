import { describe, it, expect, vi } from 'vitest';
import { Money } from '@/shared/domain/money';
import { CreditMovement } from '../domain/credit-movement';
import { Customer } from '../domain/customer';
import type { CustomerRepository } from '../domain/customer-repository.port';
import type { CustomerStatementReader, StatementRow } from '../domain/customer-credit-repository.port';
import { decodeStatementCursor } from '../domain/customer-statement';
import { CustomerNotFoundError, InvalidStatementCursorError, InvalidStatementLimitError } from '../domain/errors';
import { GetCustomerStatementUseCase } from './get-customer-statement.use-case';

const MERCHANT = 'merchant-1';
const CUSTOMER = '11111111-1111-4111-8111-111111111111';

function customer() {
  return new Customer({
    id: CUSTOMER,
    merchantId: MERCHANT,
    name: 'Ana',
    phone: '11988887777',
    creditLimit: Money.fromDecimal('100'),
    active: true,
    creditBlocked: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

let seq = 0;
function row(over: { type: 'DEBIT' | 'CREDIT'; saleId?: string | null; note?: string | null; running: string }): StatementRow {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  return {
    movement: new CreditMovement({
      id,
      merchantId: MERCHANT,
      customerId: CUSTOMER,
      type: over.type,
      amount: Money.fromDecimal('10.10'),
      operatorId: 'caixa',
      authorizedBy: 'dona',
      saleId: over.saleId ?? null,
      note: over.note ?? null,
      createdAt: new Date('2026-11-17T10:00:00Z'),
    }),
    runningBalance: Money.fromDecimal(over.running),
    position: { createdAt: '2026-11-17T10:00:00.000000Z', id },
  };
}

function build(rows: StatementRow[], found = true) {
  const getStatementPage = vi.fn().mockResolvedValue(rows);
  const customers = { findById: vi.fn().mockResolvedValue(found ? customer() : null) } as unknown as CustomerRepository;
  const credits = { getStatementPage } as unknown as CustomerStatementReader;
  return { useCase: new GetCustomerStatementUseCase(customers, credits), getStatementPage };
}

describe('GetCustomerStatementUseCase (D-28)', () => {
  it('404 when the customer is not in the merchant', async () => {
    const { useCase, getStatementPage } = build([], false);
    await expect(useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER })).rejects.toBeInstanceOf(CustomerNotFoundError);
    expect(getStatementPage).not.toHaveBeenCalled();
  });

  it.each([0, -1, 51, 1.5, NaN])('refuses limit %s', async (limit) => {
    const { useCase, getStatementPage } = build([]);
    await expect(useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER, limit })).rejects.toBeInstanceOf(InvalidStatementLimitError);
    expect(getStatementPage).not.toHaveBeenCalled();
  });

  it('refuses an invalid cursor', async () => {
    const { useCase } = build([]);
    await expect(useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER, cursor: 'xx' })).rejects.toBeInstanceOf(InvalidStatementCursorError);
  });

  it('defaults to 20 (asks 21 rows) and returns an empty page without cursor', async () => {
    const { useCase, getStatementPage } = build([]);
    const result = await useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER });
    expect(getStatementPage).toHaveBeenCalledWith(MERCHANT, CUSTOMER, { limit: 21, after: undefined });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('types the lines, hides authorizedBy and shows the note only on the reversal', async () => {
    const { useCase } = build([
      row({ type: 'CREDIT', saleId: 's1', note: 'Cancelamento: erro', running: '0.00' }),
      row({ type: 'CREDIT', note: 'Pagamento de dívida', running: '10.10' }),
      row({ type: 'DEBIT', saleId: 's1', note: 'Venda fiado', running: '20.20' }),
    ]);

    const { items } = await useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER });

    expect(items.map((i) => i.type)).toEqual(['REVERSAL', 'PAYMENT', 'PURCHASE']);
    expect(items.map((i) => i.note)).toEqual(['Cancelamento: erro', null, null]);
    expect(items[0]).not.toHaveProperty('authorizedBy');
    expect(items[0].operator).toBe('caixa');
  });

  it('locks a negative running balance at zero', async () => {
    const { useCase } = build([row({ type: 'CREDIT', running: '-5.00' })]);
    const { items } = await useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER });
    expect(items[0].balanceAfter.toDecimal()).toBe('0.00');
  });

  it('cuts the extra row and points the cursor at the last item shown', async () => {
    const rows = [1, 2, 3].map(() => row({ type: 'DEBIT', running: '10.10' }));
    const { useCase } = build(rows);

    const { items, nextCursor } = await useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER, limit: 2 });

    expect(items).toHaveLength(2);
    expect(decodeStatementCursor(CUSTOMER, nextCursor!).id).toBe(rows[1].movement.id);
  });

  it('has no cursor when the page ends exactly at the last item', async () => {
    const { useCase } = build([row({ type: 'DEBIT', running: '10.10' }), row({ type: 'DEBIT', running: '20.20' })]);
    const { items, nextCursor } = await useCase.execute({ merchantId: MERCHANT, customerId: CUSTOMER, limit: 2 });
    expect(items).toHaveLength(2);
    expect(nextCursor).toBeNull();
  });
});
