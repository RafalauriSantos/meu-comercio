import { Money } from '@/shared/domain/money';
import { Customer, toValidCreditLimit } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, OnlyOwnerSetsCreditLimitError } from '../domain/errors';
import { Phone } from '../domain/phone';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export interface CreateCustomerDTO {
  merchantId: string;
  name: string;
  phone: string;
  creditLimit?: Money;
  /** D-29: only the owner sets a limit above zero; missing means not owner. */
  actorIsOwner?: boolean;
  operatorId: string;
}

export class CreateCustomerUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(dto: CreateCustomerDTO): Promise<Customer> {
    const creditLimit = dto.creditLimit ?? Money.zero();
    if (!dto.actorIsOwner && creditLimit.toCents() > 0) {
      throw new OnlyOwnerSetsCreditLimitError();
    }
    toValidCreditLimit(creditLimit);

    const phone = Phone.create(dto.phone).value;
    const existing = await this.customerRepository.findByPhone(dto.merchantId, phone);
    if (existing) {
      throw new CustomerAlreadyExistsError(phone);
    }

    const customer = Customer.create({
      merchantId: dto.merchantId,
      name: dto.name,
      phone,
      creditLimit,
    });

    await this.customerRepository.save(customer);

    await this.auditPort.record(
      dto.merchantId,
      'CUSTOMER_CREATED',
      dto.operatorId,
      'CUSTOMER',
      customer.id,
      {
        name: customer.name,
        phone: customer.phone,
        creditLimit: customer.creditLimit.toDecimal(),
      }
    );

    return customer;
  }
}
