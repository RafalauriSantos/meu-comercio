import { Money } from '@/shared/domain/money';
import { Customer, toValidCreditLimit } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import {
  CustomerAlreadyExistsError,
  InvalidOwnerPinError,
  OnlyOwnerSetsCreditLimitError,
  OwnerPinRequiredError,
} from '../domain/errors';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';
import { Phone } from '../domain/phone';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export interface CreateCustomerDTO {
  merchantId: string;
  name: string;
  phone: string;
  creditLimit?: Money;
  /** D-29: only the owner sets a limit above zero; missing means not owner. */
  actorIsOwner?: boolean;
  /** D-22: the owner PIN, required when the limit is above zero. Never stored, logged or returned. */
  ownerPin?: string;
  operatorId: string;
}

export class CreateCustomerUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly auditPort: AuditPort,
    private readonly ownerPinVerifier: OwnerPinVerifier
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

    // D-22/D-29: a limit above zero is an increase from zero, so it needs the owner PIN.
    // Asked only after the cheap refusals, so a refused request never spends a PIN attempt.
    let authorizedBy: string | null = null;
    if (creditLimit.toCents() > 0) {
      if (!dto.ownerPin) throw new OwnerPinRequiredError();
      authorizedBy = await this.ownerPinVerifier.authorizeOwnerPin(dto.merchantId, dto.operatorId, dto.ownerPin);
      if (authorizedBy === null) throw new InvalidOwnerPinError();
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
        ...(authorizedBy && { authorizedBy }),
      }
    );

    return customer;
  }
}
