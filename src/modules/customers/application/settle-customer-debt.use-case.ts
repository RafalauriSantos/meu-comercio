import { Money } from '@/shared/domain/money';
import { CreditMovement } from '../domain/credit-movement';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerCreditRepository } from '../domain/customer-credit-repository.port';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CustomerNotFoundError,
  DebtSettlementExceedsBalanceError,
  NoOpenCashSessionError,
} from '../domain/errors';

export interface SettleCustomerDebtDTO {
  merchantId: string;
  customerId: string;
  amount: Money;
  operatorId: string;
  note?: string | null;
}

export interface SettleCustomerDebtResult {
  movement: CreditMovement;
  remainingDebt: Money;
  cashSessionId: string;
}

export class SettleCustomerDebtUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly customerCreditRepository: CustomerCreditRepository,
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(dto: SettleCustomerDebtDTO): Promise<SettleCustomerDebtResult> {
    const customer = await this.customerRepository.findById(dto.merchantId, dto.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(dto.customerId);
    }

    customer.ensureActive();

    const openSession = await this.cashSessionRepository.findCurrentOpenSession(dto.merchantId);
    if (!openSession) {
      throw new NoOpenCashSessionError();
    }

    const balance = await this.customerCreditRepository.getBalance(dto.merchantId, dto.customerId);
    if (dto.amount.isGreaterThan(balance.currentDebt)) {
      throw new DebtSettlementExceedsBalanceError();
    }

    await this.cashSessionRepository.addMovement(
      dto.merchantId,
      openSession.id,
      'DEBT_PAYMENT',
      dto.amount,
      null
    );

    const movement = CreditMovement.create({
      merchantId: dto.merchantId,
      customerId: customer.id,
      type: 'CREDIT',
      amount: dto.amount,
      operatorId: dto.operatorId,
      cashSessionId: openSession.id,
      note: dto.note ?? 'Quitação de fiado',
    });

    await this.customerCreditRepository.saveMovement(movement);

    const remainingDebt = balance.currentDebt.subtract(dto.amount);

    await this.auditPort.record(
      dto.merchantId,
      'CUSTOMER_DEBT_SETTLED',
      dto.operatorId,
      'CUSTOMER',
      customer.id,
      {
        cashSessionId: openSession.id,
        paymentAmount: dto.amount.toDecimal(),
        previousDebt: balance.currentDebt.toDecimal(),
        remainingDebt: remainingDebt.toDecimal(),
        movementId: movement.id,
      }
    );

    return {
      movement,
      remainingDebt,
      cashSessionId: openSession.id,
    };
  }
}
