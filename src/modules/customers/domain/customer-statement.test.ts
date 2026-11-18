import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import { classifyMovement, decodeStatementCursor, encodeStatementCursor, lockAtZero } from './customer-statement';
import { InvalidStatementCursorError } from './errors';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const POSITION = { createdAt: '2026-11-17T10:00:00.123456Z', id: '33333333-3333-4333-8333-333333333333' };

describe('classifyMovement (D-28)', () => {
  it('DEBIT is a purchase, with or without sale', () => {
    expect(classifyMovement({ type: 'DEBIT', saleId: 's1' })).toBe('PURCHASE');
    expect(classifyMovement({ type: 'DEBIT', saleId: null })).toBe('PURCHASE');
  });

  it('CREDIT with a sale is a reversal; without a sale it is a payment', () => {
    expect(classifyMovement({ type: 'CREDIT', saleId: 's1' })).toBe('REVERSAL');
    expect(classifyMovement({ type: 'CREDIT', saleId: null })).toBe('PAYMENT');
  });
});

describe('lockAtZero', () => {
  it('keeps a positive or zero balance and locks a negative one at 0.00', () => {
    expect(lockAtZero(Money.fromDecimal('10.30')).toDecimal()).toBe('10.30');
    expect(lockAtZero(Money.zero()).toDecimal()).toBe('0.00');
    expect(lockAtZero(Money.fromDecimal('-5.00')).toDecimal()).toBe('0.00');
  });
});

describe('statement cursor', () => {
  it('round-trips the position', () => {
    const cursor = encodeStatementCursor(CUSTOMER, POSITION);
    expect(decodeStatementCursor(CUSTOMER, cursor)).toEqual(POSITION);
  });

  it('refuses a cursor of another customer', () => {
    const cursor = encodeStatementCursor(CUSTOMER, POSITION);
    expect(() => decodeStatementCursor(OTHER, cursor)).toThrow(InvalidStatementCursorError);
  });

  it.each([
    ['not base64 json', '%%%'],
    ['empty', ''],
    ['json null', Buffer.from('null').toString('base64url')],
    ['bad date', Buffer.from(JSON.stringify({ k: CUSTOMER, c: 'ontem', i: POSITION.id })).toString('base64url')],
    ['sql in date', Buffer.from(JSON.stringify({ k: CUSTOMER, c: "2026-01-01T00:00:00Z'; drop", i: POSITION.id })).toString('base64url')],
    ['bad id', Buffer.from(JSON.stringify({ k: CUSTOMER, c: POSITION.createdAt, i: 'x' })).toString('base64url')],
  ])('refuses a malformed cursor: %s', (_name, cursor) => {
    expect(() => decodeStatementCursor(CUSTOMER, cursor)).toThrow(InvalidStatementCursorError);
  });
});
