import { describe, it, expect } from 'vitest';
import type { CustomerBalance, CustomerItem } from '@/frontend/lib/api-client';
import {
  buildRows,
  filterCounts,
  matchesQuery,
  shownText,
  statusOf,
  toCents,
  toRow,
  visibleRows,
} from './customers-list';

function customer(id: string, name: string, phone = '11981642350', creditLimit: number | string = '100.00'): CustomerItem {
  return { id, name, phone, creditLimit };
}

function balance(id: string, currentDebt: string, creditLimit = '100.00'): CustomerBalance {
  return {
    customerId: id,
    name: id,
    phone: '',
    active: true,
    creditLimit,
    currentDebt,
    availableCredit: '0.00',
    totalDebits: '0.00',
    totalCredits: '0.00',
  };
}

describe('toCents', () => {
  it('reads decimals without floating point error', () => {
    expect(toCents('85.50')).toBe(8550);
    expect(toCents('85,50')).toBe(8550);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
  });

  it('is null for a missing or invalid value', () => {
    expect(toCents(undefined)).toBeNull();
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
  });
});

describe('statusOf', () => {
  it('is "ok" with no debt', () => {
    expect(statusOf(0, 10000)).toBe('ok');
    expect(statusOf(0, 0)).toBe('ok');
  });

  it('is "unknown" while the balance is not loaded', () => {
    expect(statusOf(null, 10000)).toBe('unknown');
  });

  it('is "owing" below 80% of the limit and "near" from 80%', () => {
    expect(statusOf(7999, 10000)).toBe('owing');
    expect(statusOf(8000, 10000)).toBe('near');
    expect(statusOf(9999, 10000)).toBe('near');
  });

  it('is "over" when the debt reaches the limit, and with limit zero and debt', () => {
    expect(statusOf(10000, 10000)).toBe('over');
    expect(statusOf(23000, 20000)).toBe('over');
    expect(statusOf(1, 0)).toBe('over');
    expect(statusOf(1, null)).toBe('over');
  });
});

describe('toRow', () => {
  it('compares debt and limit in cents: 0.10 + 0.20 against 0.30 is over the limit', () => {
    const row = toRow(customer('a', 'Ana'), balance('a', String(0.1 + 0.2), '0.30'));
    expect(row.debtCents).toBe(30);
    expect(row.limitCents).toBe(30);
    expect(row.status).toBe('over');
  });

  it('shows the phone masked, or as it is with the off-pattern mark', () => {
    const std = toRow(customer('a', 'Ana', '11981642350'), undefined);
    expect(std.phoneText).toBe('(11) 98164-2350');
    expect(std.offPattern).toBe(false);
    const old = toRow(customer('b', 'Joao', '6261616161649496169'), undefined);
    expect(old.phoneText).toBe('6261616161649496169');
    expect(old.offPattern).toBe(true);
  });

  it('without a balance the debt is unknown and the limit comes from the customer', () => {
    const row = toRow(customer('a', 'Ana', '11981642350', '100.00'), undefined);
    expect(row.status).toBe('unknown');
    expect(row.debtCents).toBeNull();
    expect(row.limitCents).toBe(10000);
    expect(row.availableCents).toBeNull();
    expect(row.balance).toBeNull();
  });

  it('computes the bar percent in integers, capped at 100, and the available credit never below zero', () => {
    const half = toRow(customer('a', 'Ana'), balance('a', '85.50'));
    expect(half.percent).toBe(85);
    expect(half.availableCents).toBe(1450);
    const over = toRow(customer('b', 'Bia'), balance('b', '230.00', '200.00'));
    expect(over.percent).toBe(100);
    expect(over.availableCents).toBe(0);
  });
});

const customers = [
  customer('1', 'Maria Souza'),
  customer('2', 'Seu Antenor', '1532345678'),
  customer('3', 'João Pereira', '11999998888'),
  customer('4', 'Padaria Estrela', '15997771234'),
  customer('5', 'joazinho', '6261616161649496169'),
];
const balances = {
  '1': balance('1', '85.50'),
  '2': balance('2', '0.00'),
  '3': balance('3', '230.00', '200.00'),
  '4': balance('4', '40.00', '300.00'),
  '5': balance('5', '0.00'),
};

describe('buildRows', () => {
  it('puts the biggest debt first and breaks a tie by name', () => {
    const rows = buildRows(
      [customer('1', 'Zeca'), customer('2', 'Ana'), customer('3', 'Caio'), customer('4', 'Bia')],
      { '1': balance('1', '10.00'), '2': balance('2', '10.00'), '3': balance('3', '50.00'), '4': balance('4', '0.00') },
    );
    expect(rows.map((r) => r.name)).toEqual(['Caio', 'Ana', 'Zeca', 'Bia']);
  });
});

describe('filterCounts and visibleRows', () => {
  const rows = buildRows(customers, balances);

  it('counts each chip over all customers', () => {
    expect(filterCounts(rows)).toEqual({ all: 5, owing: 3, over: 1 });
  });

  it('shows only the group of the chip', () => {
    expect(visibleRows(rows, 'all', '')).toHaveLength(5);
    expect(visibleRows(rows, 'owing', '').map((r) => r.name)).toEqual(['João Pereira', 'Maria Souza', 'Padaria Estrela']);
    expect(visibleRows(rows, 'over', '').map((r) => r.name)).toEqual(['João Pereira']);
  });

  it('combines the search with the chip', () => {
    expect(visibleRows(rows, 'owing', 'maria').map((r) => r.name)).toEqual(['Maria Souza']);
    expect(visibleRows(rows, 'over', 'maria')).toEqual([]);
  });

  it('a customer without a balance is not counted as a debtor', () => {
    const noBalance = buildRows([customer('1', 'Ana')], {});
    expect(filterCounts(noBalance)).toEqual({ all: 1, owing: 0, over: 0 });
  });
});

describe('matchesQuery', () => {
  const row = { name: 'Maria Souza', phoneText: '(11) 99999-8888' };

  it('finds by name in any case', () => {
    expect(matchesQuery(row, 'maria')).toBe(true);
    expect(matchesQuery(row, 'MARIA')).toBe(true);
    expect(matchesQuery(row, 'pedro')).toBe(false);
  });

  it('finds by part of the phone, with or without mask', () => {
    expect(matchesQuery(row, '11999')).toBe(true);
    expect(matchesQuery(row, '(11) 99999')).toBe(true);
    expect(matchesQuery(row, '99999-8888')).toBe(true);
    expect(matchesQuery(row, '2222')).toBe(false);
  });

  it('does not use the digits of a text that is not a phone', () => {
    expect(matchesQuery(row, 'maria 9')).toBe(false);
  });

  it('an empty search matches everyone', () => {
    expect(matchesQuery(row, '  ')).toBe(true);
  });
});

describe('shownText', () => {
  it('says how many are shown of the total', () => {
    expect(shownText(2, 5)).toBe('Mostrando 2 de 5 clientes');
    expect(shownText(1, 1)).toBe('Mostrando 1 de 1 cliente');
  });
});
