import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { CashSession } from '../domain/cash-session';
import { CashSessionRepository } from '../domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export const OpenCashSessionSchema = z.object({
  openingBalance: z.union([z.number(), z.string()]).refine(val => {
    try {
      const m = Money.fromDecimal(val);
      return !m.isNegative();
    } catch {
      return false;
    }
  }, 'Saldo inicial deve ser um valor monetário válido e não negativo'),
});

export type OpenCashSessionInput = z.infer<typeof OpenCashSessionSchema>;

export class CashSessionAlreadyOpenError extends Error {
  constructor() {
    super('Já existe uma sessão de caixa aberta para este comércio. Feche o caixa anterior antes de abrir um novo.');
    this.name = 'CashSessionAlreadyOpenError';
  }
}

export class OpenCashSessionUseCase {
  constructor(
    private readonly cashRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(merchantId: string, operatorId: string, rawInput: unknown): Promise<CashSession> {
    const input = OpenCashSessionSchema.parse(rawInput);
    const openingBalance = Money.fromDecimal(input.openingBalance);

    const existingSession = await this.cashRepository.findCurrentOpenSession(merchantId);
    if (existingSession) {
      throw new CashSessionAlreadyOpenError();
    }

    const session = CashSession.create(merchantId, operatorId, openingBalance);

    await this.cashRepository.openSession(session);
    await this.cashRepository.addMovement(
      merchantId,
      session.id,
      'OPENING_BALANCE',
      openingBalance
    );

    await this.auditPort.record(
      merchantId,
      'CASH_SESSION_OPENED',
      operatorId,
      'CASH_SESSION',
      session.id,
      {
        openingBalance: openingBalance.toDecimal(),
        openedBy: operatorId,
      }
    );

    return session;
  }
}
