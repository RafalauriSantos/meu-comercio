import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError } from '../domain/errors';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export interface CreateCustomerDTO {
  merchantId: string;
  name: string;
  phone: string;
  creditLimit?: Money;
  operatorId: string;
}

export class CreateCustomerUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(dto: CreateCustomerDTO): Promise<Customer> {
    const existing = await this.customerRepository.findByPhone(dto.merchantId, dto.phone);
    if (existing) {
      throw new CustomerAlreadyExistsError(dto.phone);
    }

    const customer = Customer.create({
      merchantId: dto.merchantId,
      name: dto.name,
      phone: dto.phone,
      creditLimit: dto.creditLimit ?? Money.zero(),
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
