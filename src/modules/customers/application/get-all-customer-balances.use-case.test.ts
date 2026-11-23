import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerCreditBalanceOf, CustomerBalancesReader } from '../domain/customer-credit-repository.port';
import { GetAllCustomerBalancesUseCase } from './get-all-customer-balances.use-case';

const MERCHANT = 'merchant-1';

function customer(id: string, creditLimit: string) {
  return Customer.create({ id, merchantId: MERCHANT, name: `Cliente ${id}`, phone: '11988887777', creditLimit: Money.fromDecimal(creditLimit) });
}

function repo(active: Customer[]): CustomerRepository {
  return { findAllActive: async () => active } as unknown as CustomerRepository;
}

function reader(rows: CustomerCreditBalanceOf[]): CustomerBalancesReader & { calls: number } {
  const r = {
    calls: 0,
    getBalances: async () => {
      r.calls += 1;
      return rows;
    },
  };
  return r;
}

const money = (v: string) => Money.fromDecimal(v);

describe('GetAllCustomerBalancesUseCase', () => {
  it('combines each active customer with its balance, using the customer rule for the available credit', async () => {
    const balances = reader([
      { customerId: 'a', currentDebt: money('30'), totalDebits: money('50'), totalCredits: money('20') },
      { customerId: 'b', currentDebt: money('150'), totalDebits: money('150'), totalCredits: money('0') },
    ]);
    const useCase = new GetAllCustomerBalancesUseCase(repo([customer('a', '100'), customer('b', '100')]), balances);

    const result = await useCase.execute({ merchantId: MERCHANT });

    expect(result.map((r) => [r.customer.id, r.currentDebt.toDecimal(), r.availableCredit.toDecimal(), r.creditLimit.toDecimal(), r.totalDebits.toDecimal(), r.totalCredits.toDecimal()])).toEqual([
      ['a', '30.00', '70.00', '100.00', '50.00', '20.00'],
      // Debt above the limit: available is zero, as calculateAvailableCredit says.
      ['b', '150.00', '0.00', '100.00', '150.00', '0.00'],
    ]);
  });

  it('a customer with no movements has zero debt and the full limit', async () => {
    const useCase = new GetAllCustomerBalancesUseCase(repo([customer('c', '80')]), reader([]));

    const [result] = await useCase.execute({ merchantId: MERCHANT });

    expect(result.currentDebt.toDecimal()).toBe('0.00');
    expect(result.availableCredit.toDecimal()).toBe('80.00');
    expect(result.totalDebits.toDecimal()).toBe('0.00');
    expect(result.totalCredits.toDecimal()).toBe('0.00');
  });

  it('reads the balances once for the whole list, not once per customer', async () => {
    const balances = reader([]);
    const useCase = new GetAllCustomerBalancesUseCase(repo([customer('a', '1'), customer('b', '1'), customer('c', '1')]), balances);

    await useCase.execute({ merchantId: MERCHANT });

    expect(balances.calls).toBe(1);
  });

  it('no customers: empty list', async () => {
    const useCase = new GetAllCustomerBalancesUseCase(repo([]), reader([]));
    expect(await useCase.execute({ merchantId: MERCHANT })).toEqual([]);
  });
});
