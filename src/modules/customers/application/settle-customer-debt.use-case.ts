import { Money } from '@/shared/domain/money';
import { CreditMovement } from '../domain/credit-movement';
import { CustomerRepository } from '../domain/customer-repository.port';
import { DebtSettlementRepository } from '../domain/debt-settlement-repository.port';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
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
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly debtSettlementRepository: DebtSettlementRepository
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

    let movement!: CreditMovement;
    let remainingDebt!: Money;

    // The repository reads the debt after locking the customer, so two settlements cannot both pass.
    await this.debtSettlementRepository.commitDebtSettlement({
      merchantId: dto.merchantId,
      customerId: customer.id,
      cashSessionId: openSession.id,
      amount: dto.amount,
      decide: (currentDebt) => {
        if (dto.amount.isGreaterThan(currentDebt)) {
          throw new DebtSettlementExceedsBalanceError();
        }

        movement = CreditMovement.create({
          merchantId: dto.merchantId,
          customerId: customer.id,
          type: 'CREDIT',
          amount: dto.amount,
          operatorId: dto.operatorId,
          cashSessionId: openSession.id,
          note: dto.note ?? 'Quitação de fiado',
        });
        remainingDebt = currentDebt.subtract(dto.amount);

        return {
          movement,
          audit: {
            eventType: 'CUSTOMER_DEBT_SETTLED',
            actorId: dto.operatorId,
            aggregateType: 'CUSTOMER',
            aggregateId: customer.id,
            details: {
              cashSessionId: openSession.id,
              paymentAmount: dto.amount.toDecimal(),
              previousDebt: currentDebt.toDecimal(),
              remainingDebt: remainingDebt.toDecimal(),
              movementId: movement.id,
            },
          },
        };
      },
    });

    return { movement, remainingDebt, cashSessionId: openSession.id };
  }
}
