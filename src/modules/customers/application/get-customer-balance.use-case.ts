import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerCreditRepository } from '../domain/customer-credit-repository.port';
import { CustomerNotFoundError } from '../domain/errors';

export interface GetCustomerBalanceDTO {
  merchantId: string;
  customerId: string;
}

export interface CustomerBalanceResult {
  customer: Customer;
  currentDebt: Money;
  availableCredit: Money;
  creditLimit: Money;
  totalDebits: Money;
  totalCredits: Money;
}

export class GetCustomerBalanceUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly customerCreditRepository: CustomerCreditRepository
  ) {}

  public async execute(dto: GetCustomerBalanceDTO): Promise<CustomerBalanceResult> {
    const customer = await this.customerRepository.findById(dto.merchantId, dto.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(dto.customerId);
    }

    const balance = await this.customerCreditRepository.getBalance(dto.merchantId, dto.customerId);
    const availableCredit = customer.calculateAvailableCredit(balance.currentDebt);

    return {
      customer,
      currentDebt: balance.currentDebt,
      availableCredit,
      creditLimit: customer.creditLimit,
      totalDebits: balance.totalDebits,
      totalCredits: balance.totalCredits,
    };
  }
}
