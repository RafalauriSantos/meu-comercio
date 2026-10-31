import { Money } from '@/shared/domain/money';
import { CreditMovement } from '../domain/credit-movement';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerCreditRepository } from '../domain/customer-credit-repository.port';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CustomerNotFoundError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
} from '../domain/errors';

export interface AuthorizeCreditSaleDTO {
  merchantId: string;
  customerId: string;
  saleAmount: Money;
  operatorId: string;
  ownerPin?: string;
  ownerUsername?: string;
  saleId?: string | null;
  note?: string | null;
}

export interface AuthorizeCreditSaleResult {
  authorized: boolean;
  movement: CreditMovement;
  requiresOwnerPin: boolean;
  authorizedBy: string | null;
}

export class AuthorizeCreditSaleUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly customerCreditRepository: CustomerCreditRepository,
    private readonly ownerPinVerifier: OwnerPinVerifier,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(dto: AuthorizeCreditSaleDTO): Promise<AuthorizeCreditSaleResult> {
    const customer = await this.customerRepository.findById(dto.merchantId, dto.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(dto.customerId);
    }

    customer.ensureActive();

    const balance = await this.customerCreditRepository.getBalance(dto.merchantId, dto.customerId);
    const exceedsLimit = customer.wouldExceedCreditLimit(balance.currentDebt, dto.saleAmount);

    let authorizedBy: string | null = null;
    let requiresOwnerPin = false;

    if (exceedsLimit) {
      if (!dto.ownerPin) {
        throw new CreditLimitExceededError();
      }

      const ownerUsername = dto.ownerUsername ?? 'owner';
      const isPinValid = await this.ownerPinVerifier.verifyOwnerPin(
        dto.merchantId,
        ownerUsername,
        dto.ownerPin
      );

      if (!isPinValid) {
        throw new InvalidOwnerPinError();
      }

      authorizedBy = ownerUsername;
      requiresOwnerPin = true;

      await this.auditPort.record(
        dto.merchantId,
        'CREDIT_SALE_LIMIT_AUTHORIZED',
        dto.operatorId,
        'CUSTOMER',
        customer.id,
        {
          saleAmount: dto.saleAmount.toDecimal(),
          currentDebt: balance.currentDebt.toDecimal(),
          creditLimit: customer.creditLimit.toDecimal(),
          authorizedBy,
          saleId: dto.saleId ?? null,
        }
      );
    }

    const movement = CreditMovement.create({
      merchantId: dto.merchantId,
      customerId: customer.id,
      type: 'DEBIT',
      amount: dto.saleAmount,
      operatorId: dto.operatorId,
      authorizedBy,
      saleId: dto.saleId,
      note: dto.note,
    });

    await this.customerCreditRepository.saveMovement(movement);

    return {
      authorized: true,
      movement,
      requiresOwnerPin,
      authorizedBy,
    };
  }
}
