import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { CashSessionRepository } from '../domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export const CloseCashSessionSchema = z.object({
  closingBalance: z.union([z.number(), z.string()]).refine(val => {
    try {
      const m = Money.fromDecimal(val);
      return !m.isNegative();
    } catch {
      return false;
    }
  }, 'Saldo final contado deve ser um valor monetário válido e não negativo'),
  discrepancyReason: z.string().trim().max(300, 'A justificativa não pode ter mais de 300 caracteres').optional(),
});

export type CloseCashSessionInput = z.infer<typeof CloseCashSessionSchema>;

export class CashSessionNotOpenError extends Error {
  constructor(sessionId: string) {
    super(`A sessão de caixa [${sessionId}] não está aberta.`);
    this.name = 'CashSessionNotOpenError';
  }
}

export class CashSessionCloseNotAuthorizedError extends Error {
  constructor() {
    super('Apenas o operador que abriu o turno de caixa ou a proprietária tem permissão para encerrá-lo.');
    this.name = 'CashSessionCloseNotAuthorizedError';
  }
}

export class DiscrepancyReasonRequiredError extends Error {
  constructor() {
    super('É obrigatório informar uma justificativa quando o valor contado em caixa diferir do valor esperado.');
    this.name = 'DiscrepancyReasonRequiredError';
  }
}

export class CloseCashSessionUseCase {
  constructor(
    private readonly cashRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(
    merchantId: string,
    sessionId: string,
    operatorId: string,
    isOwner: boolean,
    rawInput: unknown
  ): Promise<{ expectedCash: Money; closingBalance: Money; difference: Money }> {
    const input = CloseCashSessionSchema.parse(rawInput);
    const closingBalance = Money.fromDecimal(input.closingBalance);

    const session = await this.cashRepository.findSessionById(merchantId, sessionId);
    if (!session || !session.isOpen()) {
      throw new CashSessionNotOpenError(sessionId);
    }

    const normalizedOperator = operatorId.trim().toLowerCase();
    // Rule: only the opening operator or the owner can close the shift
    if (!isOwner && session.openedBy !== normalizedOperator) {
      throw new CashSessionCloseNotAuthorizedError();
    }

    const expectedCash = await this.cashRepository.getExpectedCash(merchantId, sessionId);
    const difference = closingBalance.subtract(expectedCash);

    const hasDiscrepancy = !difference.isZero();
    const reason = input.discrepancyReason?.trim();

    if (hasDiscrepancy && !reason) {
      throw new DiscrepancyReasonRequiredError();
    }

    if (reason && reason.includes('\0')) {
      throw new Error('Justificativa inválida.');
    }

    const closedAt = new Date();
    session.close(normalizedOperator, closingBalance, closedAt);

    await this.cashRepository.closeSession(
      merchantId,
      sessionId,
      normalizedOperator,
      closingBalance,
      closedAt
    );

    await this.cashRepository.addMovement(
      merchantId,
      sessionId,
      'CLOSING_BALANCE',
      closingBalance
    );

    await this.auditPort.record(
      merchantId,
      'CASH_SESSION_CLOSED',
      normalizedOperator,
      'CASH_SESSION',
      sessionId,
      {
        expectedCash: expectedCash.toDecimal(),
        closingBalance: closingBalance.toDecimal(),
        difference: difference.toDecimal(),
        reason: reason || '',
        closedBy: normalizedOperator,
      }
    );

    return {
      expectedCash,
      closingBalance,
      difference,
    };
  }
}
