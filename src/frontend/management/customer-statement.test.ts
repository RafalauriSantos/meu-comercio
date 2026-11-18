import { describe, it, expect } from 'vitest';
import { formatStatementDate, mergeStatementItems, statementRow, STATEMENT_PAGE_SIZE, type StatementItem } from './customer-statement';

function item(over: Partial<StatementItem> = {}): StatementItem {
  return {
    id: 'm1',
    type: 'PURCHASE',
    amount: '100.00',
    balanceAfter: '100.00',
    createdAt: '2026-11-17T17:35:00.000Z',
    saleId: 's1',
    operator: 'rafael',
    note: null,
    ...over,
  };
}

describe('formatStatementDate', () => {
  it('shows the time of Brasilia as dd/mm/yyyy hh:mm', () => {
    expect(formatStatementDate('2026-11-17T17:35:00.000Z')).toBe('17/11/2026 14:35');
  });

  it('shows 02:30 UTC as 23:30 of the day before', () => {
    expect(formatStatementDate('2026-11-17T02:30:00.000Z')).toBe('16/11/2026 23:30');
  });
});

describe('statementRow', () => {
  it('names the three types and gives the debt a plus and the credits a minus', () => {
    expect(statementRow(item({ type: 'PURCHASE' }))).toMatchObject({ label: 'Compra no fiado', sign: '+', toneClass: 'mg-stmt-debt', amount: 'R$ 100,00' });
    expect(statementRow(item({ type: 'PAYMENT', amount: '30.00', saleId: null }))).toMatchObject({ label: 'Pagamento', sign: '−', toneClass: 'mg-stmt-credit', amount: 'R$ 30,00' });
    expect(statementRow(item({ type: 'REVERSAL' }))).toMatchObject({ label: 'Estorno por cancelamento', sign: '−', toneClass: 'mg-stmt-credit' });
  });

  it('formats the balance after the line with cents and no float error', () => {
    expect(statementRow(item({ balanceAfter: '10.30' })).balance).toBe('R$ 10,30');
  });

  it('shows the reason only on a reversal', () => {
    expect(statementRow(item({ type: 'REVERSAL', note: 'Cliente desistiu' })).reason).toBe('Cliente desistiu');
    expect(statementRow(item({ type: 'REVERSAL', note: null })).reason).toBeNull();
    expect(statementRow(item({ type: 'PURCHASE', note: 'Venda fiado' })).reason).toBeNull();
    expect(statementRow(item({ type: 'PAYMENT', note: 'Pago no balcão', saleId: null })).reason).toBeNull();
  });
});

describe('mergeStatementItems', () => {
  it('appends the next page in order', () => {
    const merged = mergeStatementItems([item({ id: 'a' })], [item({ id: 'b' }), item({ id: 'c' })]);
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops a line that is already shown, so a double answer does not repeat it', () => {
    const merged = mergeStatementItems([item({ id: 'a' }), item({ id: 'b' })], [item({ id: 'b' }), item({ id: 'c' })]);
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('asks for 20 lines at a time', () => {
    expect(STATEMENT_PAGE_SIZE).toBe(20);
  });
});
