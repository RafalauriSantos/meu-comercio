import { Money } from '@/shared/domain/money';
import { CashSessionRepository } from '../domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export class NoOpenCashSessionError extends Error {
  constructor(message = 'Não há sessão de caixa aberta para esta operação.') {
    super(message);
    this.name = 'NoOpenCashSessionError';
  }
}

export class InsufficientCashForWithdrawalError extends Error {
  constructor(message = 'Saldo em dinheiro na gaveta insuficiente para realizar a sangria.') {
    super(message);
    this.name = 'InsufficientCashForWithdrawalError';
  }
}

export class InvalidCashOperationReasonError extends Error {
  constructor(message = 'O motivo da operação de caixa deve conter no mínimo 3 caracteres.') {
    super(message);
    this.name = 'InvalidCashOperationReasonError';
  }
}

export class InvalidCashOperationAmountError extends Error {
  constructor(message = 'O valor da operação de caixa deve ser estritamente positivo.') {
    super(message);
    this.name = 'InvalidCashOperationAmountError';
  }
}

export interface CashDepositDTO {
  merchantId: string;
  operatorId: string;
  amount: Money;
  reason: string;
}

export interface CashWithdrawalDTO {
  merchantId: string;
  operatorId: string;
  amount: Money;
  reason: string;
}

export interface CashOperationResult {
  sessionId: string;
  movementType: 'DEPOSIT' | 'WITHDRAWAL';
  amount: Money;
  expectedCash: Money;
  reason: string;
}

function validateCashOperation(dto: { reason: string; amount: Money }): string {
  const trimmedReason = dto.reason?.trim() ?? '';
  if (trimmedReason.length < 3) {
    throw new InvalidCashOperationReasonError();
  }
  if (!dto.amount.isPositive()) {
    throw new InvalidCashOperationAmountError();
  }
  return trimmedReason;
}

export class RecordCashDepositUseCase {
  constructor(
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  async execute(dto: CashDepositDTO): Promise<CashOperationResult> {
    const trimmedReason = validateCashOperation(dto);

    const openSession = await this.cashSessionRepository.findCurrentOpenSession(dto.merchantId);
    if (!openSession) {
      throw new NoOpenCashSessionError();
    }

    await this.cashSessionRepository.addMovement(
      dto.merchantId,
      openSession.id,
      'DEPOSIT',
      dto.amount,
      null,
      trimmedReason,
      dto.operatorId
    );

    const newExpectedCash = await this.cashSessionRepository.getExpectedCash(
      dto.merchantId,
      openSession.id
    );

    await this.auditPort.record(
      dto.merchantId,
      'CASH_DEPOSIT_RECORDED',
      dto.operatorId,
      'cash_session',
      openSession.id,
      {
        amount: dto.amount.toDecimal(),
        reason: trimmedReason,
        expectedCash: newExpectedCash.toDecimal(),
      }
    );

    return {
      sessionId: openSession.id,
      movementType: 'DEPOSIT',
      amount: dto.amount,
      expectedCash: newExpectedCash,
      reason: trimmedReason,
    };
  }
}

export class RecordCashWithdrawalUseCase {
  constructor(
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  async execute(dto: CashWithdrawalDTO): Promise<CashOperationResult> {
    const trimmedReason = validateCashOperation(dto);

    const openSession = await this.cashSessionRepository.findCurrentOpenSession(dto.merchantId);
    if (!openSession) {
      throw new NoOpenCashSessionError();
    }

    const currentCash = await this.cashSessionRepository.getExpectedCash(
      dto.merchantId,
      openSession.id
    );

    if (dto.amount.greaterThan(currentCash)) {
      throw new InsufficientCashForWithdrawalError(
        `Saldo insuficiente no caixa. Disponível: R$ ${currentCash.toDecimal()}, Solicitado: R$ ${dto.amount.toDecimal()}.`
      );
    }

    await this.cashSessionRepository.addMovement(
      dto.merchantId,
      openSession.id,
      'WITHDRAWAL',
      dto.amount,
      null,
      trimmedReason,
      dto.operatorId
    );

    const newExpectedCash = await this.cashSessionRepository.getExpectedCash(
      dto.merchantId,
      openSession.id
    );

    await this.auditPort.record(
      dto.merchantId,
      'CASH_WITHDRAWAL_RECORDED',
      dto.operatorId,
      'cash_session',
      openSession.id,
      {
        amount: dto.amount.toDecimal(),
        reason: trimmedReason,
        expectedCash: newExpectedCash.toDecimal(),
      }
    );

    return {
      sessionId: openSession.id,
      movementType: 'WITHDRAWAL',
      amount: dto.amount,
      expectedCash: newExpectedCash,
      reason: trimmedReason,
    };
  }
}
