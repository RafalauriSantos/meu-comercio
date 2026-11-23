import { Money } from '@/shared/domain/money';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerBalancesReader } from '../domain/customer-credit-repository.port';
import { CustomerBalanceResult } from './get-customer-balance.use-case';

export interface GetAllCustomerBalancesDTO {
  merchantId: string;
}

const NO_MOVEMENTS = { currentDebt: Money.zero(), totalDebits: Money.zero(), totalCredits: Money.zero() };

/** The balance of every active customer, as /balance gives one by one, from one balances query. */
export class GetAllCustomerBalancesUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly customerBalancesReader: CustomerBalancesReader
  ) {}

  public async execute(dto: GetAllCustomerBalancesDTO): Promise<CustomerBalanceResult[]> {
    const customers = await this.customerRepository.findAllActive(dto.merchantId);
    const balances = await this.customerBalancesReader.getBalances(dto.merchantId);
    const byCustomerId = new Map(balances.map((balance) => [balance.customerId, balance]));

    return customers.map((customer) => {
      const balance = byCustomerId.get(customer.id) ?? NO_MOVEMENTS;
      return {
        customer,
        currentDebt: balance.currentDebt,
        availableCredit: customer.calculateAvailableCredit(balance.currentDebt),
        creditLimit: customer.creditLimit,
        totalDebits: balance.totalDebits,
        totalCredits: balance.totalCredits,
      };
    });
  }
}
