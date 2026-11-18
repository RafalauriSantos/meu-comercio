import { Money } from '@/shared/domain/money';
import { CreditMovement } from './credit-movement';
import { InvalidStatementCursorError } from './errors';

export type StatementEntryType = 'PURCHASE' | 'PAYMENT' | 'REVERSAL';

/** D-28: the kind comes from the type and the sale link, never from the free-text note. */
export function classifyMovement(movement: Pick<CreditMovement, 'type' | 'saleId'>): StatementEntryType {
  if (movement.type === 'DEBIT') return 'PURCHASE';
  return movement.saleId ? 'REVERSAL' : 'PAYMENT';
}

/** Running balance shown on a line: locked at zero like getBalance, so the newest line equals currentDebt. */
export function lockAtZero(rawBalance: Money): Money {
  return rawBalance.isNegative() ? Money.zero() : rawBalance;
}

/** Position of the last item of a page. `createdAt` keeps the database precision (microseconds) as UTC text. */
export interface StatementPosition {
  createdAt: string;
  id: string;
}

const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque cursor, bound to the customer so a cursor from another customer is refused. */
export function encodeStatementCursor(customerId: string, position: StatementPosition): string {
  return Buffer.from(JSON.stringify({ k: customerId, c: position.createdAt, i: position.id })).toString('base64url');
}

export function decodeStatementCursor(customerId: string, cursor: string): StatementPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidStatementCursorError();
  }
  const data = parsed as { k?: unknown; c?: unknown; i?: unknown } | null;
  if (
    !data ||
    typeof data !== 'object' ||
    data.k !== customerId ||
    typeof data.c !== 'string' ||
    !CREATED_AT.test(data.c) ||
    typeof data.i !== 'string' ||
    !UUID.test(data.i)
  ) {
    throw new InvalidStatementCursorError();
  }
  return { createdAt: data.c, id: data.i };
}
