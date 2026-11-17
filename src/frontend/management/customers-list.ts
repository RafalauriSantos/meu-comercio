import type { CustomerBalance, CustomerItem } from '@/frontend/lib/api-client';
import { isStandardPhone, displayPhone } from '@/frontend/lib/phone-mask';
import { Money } from '@/shared/domain/money';

// Pure rules of the customers list (the hook holds the state, the component only draws).
// Every money comparison is made in integer cents, never in floating point.

export type CustomerStatus = 'ok' | 'owing' | 'near' | 'over' | 'unknown';
export type CustomerFilter = 'all' | 'owing' | 'over';

export const CUSTOMER_FILTERS: { value: CustomerFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'owing', label: 'Devendo' },
  { value: 'over', label: 'Acima do limite' },
];

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  ok: 'Em dia',
  owing: 'Devendo',
  near: 'Perto do limite',
  over: 'Acima do limite',
  unknown: 'Saldo indisponível',
};

export const STATUS_CLASS: Record<CustomerStatus, string> = {
  ok: 'mg-badge mg-badge-ok',
  owing: 'mg-badge mg-badge-owing',
  near: 'mg-badge mg-badge-near',
  over: 'mg-badge mg-badge-over',
  unknown: 'mg-badge',
};

export interface CustomerRow {
  id: string;
  name: string;
  phoneText: string;
  offPattern: boolean;
  status: CustomerStatus;
  /** Null while the balance has not arrived: the debt is unknown, not zero. */
  debtCents: number | null;
  limitCents: number | null;
  availableCents: number | null;
  /** 0 to 100, how much of the limit the debt uses. */
  percent: number;
  balance: CustomerBalance | null;
  creditBlocked: boolean;
}

/** A decimal (number or string such as "85.50") as integer cents; null when it is missing or not a number. */
export function toCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    return Money.fromDecimal(typeof value === 'number' ? value : value.replace(',', '.')).toCents();
  } catch {
    return null;
  }
}

/** Debt at or above the limit is "over" (a zero limit with debt too); from 80% of the limit it is "near". */
export function statusOf(debtCents: number | null, limitCents: number | null): CustomerStatus {
  if (debtCents === null) return 'unknown';
  if (debtCents <= 0) return 'ok';
  if (limitCents === null || limitCents <= 0 || debtCents >= limitCents) return 'over';
  if (debtCents * 100 >= limitCents * 80) return 'near';
  return 'owing';
}

function percentOf(debtCents: number, limitCents: number | null): number {
  if (debtCents <= 0) return 0;
  if (limitCents === null || limitCents <= 0) return 100;
  return Math.min(100, Math.floor((debtCents * 100) / limitCents));
}

export function toRow(customer: CustomerItem, balance: CustomerBalance | undefined): CustomerRow {
  const debtCents = balance ? toCents(balance.currentDebt) : null;
  const limitCents = toCents(balance ? balance.creditLimit : customer.creditLimit);
  return {
    id: customer.id,
    name: customer.name,
    phoneText: displayPhone(customer.phone),
    offPattern: !isStandardPhone(customer.phone),
    status: statusOf(debtCents, limitCents),
    debtCents,
    limitCents,
    availableCents: debtCents === null || limitCents === null ? null : Math.max(0, limitCents - debtCents),
    percent: percentOf(debtCents ?? 0, limitCents),
    balance: balance ?? null,
    creditBlocked: customer.creditBlocked === true,
  };
}

/** Biggest debt first, a tie by name. */
export function buildRows(customers: CustomerItem[], balances: Record<string, CustomerBalance>): CustomerRow[] {
  return customers
    .map((c) => toRow(c, balances[c.id]))
    .sort((a, b) => (b.debtCents ?? 0) - (a.debtCents ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

const PHONE_QUERY = /^[\d\s()+.-]+$/;

/** By name, or by the phone digits when the text looks like a phone (so "11999" finds "(11) 99999-8888"). */
export function matchesQuery(row: Pick<CustomerRow, 'name' | 'phoneText'>, query: string): boolean {
  const text = query.trim();
  if (text === '') return true;
  if (row.name.toLowerCase().includes(text.toLowerCase())) return true;
  if (!PHONE_QUERY.test(text)) return false;
  return row.phoneText.replace(/\D/g, '').includes(text.replace(/\D/g, ''));
}

function matchesFilter(row: CustomerRow, filter: CustomerFilter): boolean {
  if (filter === 'owing') return row.debtCents !== null && row.debtCents > 0;
  if (filter === 'over') return row.status === 'over';
  return true;
}

export function visibleRows(rows: CustomerRow[], filter: CustomerFilter, query: string): CustomerRow[] {
  return rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query));
}

/** The count of each chip, over every customer (the search does not change it). */
export function filterCounts(rows: CustomerRow[]): Record<CustomerFilter, number> {
  return {
    all: rows.length,
    owing: rows.filter((r) => matchesFilter(r, 'owing')).length,
    over: rows.filter((r) => matchesFilter(r, 'over')).length,
  };
}

export function shownText(shown: number, total: number): string {
  return `Mostrando ${shown} de ${total} ${total === 1 ? 'cliente' : 'clientes'}`;
}
