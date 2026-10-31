import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { CashSession, CashMovementType } from '../domain/cash-session';
import { CashSessionRepository, CurrentCashSessionSummary } from '../domain/cash-session-repository.port';
import { OpenCashSessionUseCase, CashSessionAlreadyOpenError } from './open-cash-session.use-case';
import {
  CloseCashSessionUseCase,
  CashSessionCloseNotAuthorizedError,
  DiscrepancyReasonRequiredError,
  CashSessionNotOpenError,
} from './close-cash-session.use-case';
import { AuditPort } from '@/modules/audit/domain/audit.port';

class MockAuditService implements AuditPort {
  public records: Array<{ eventType: string; actorId: string; details: Record<string, unknown> }> = [];

  async record(
    _merchantId: string,
    eventType: string,
    actorId: string,
    _aggregateType: string,
    _aggregateId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    this.records.push({ eventType, actorId, details });
  }
}

class MockCashSessionRepository implements CashSessionRepository {
  public sessions: Map<string, CashSession> = new Map();
  public movements: Array<{ sessionId: string; movementType: CashMovementType; amount: Money }> = [];

  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    const open = Array.from(this.sessions.values()).find(
      s => s.merchantId === merchantId && s.isOpen()
    );
    if (!open) return null;

    const expectedCash = await this.getExpectedCash(merchantId, open.id);
    return {
      id: open.id,
      merchantId: open.merchantId,
      openedBy: open.openedBy,
      openingBalance: open.openingBalance,
      openedAt: open.openedAt,
      expectedCash,
      movementsCount: this.movements.filter(m => m.sessionId === open.id).length,
    };
  }

  async findSessionById(merchantId: string, sessionId: string): Promise<CashSession | null> {
    const s = this.sessions.get(sessionId);
    return s && s.merchantId === merchantId ? s : null;
  }

  async openSession(session: CashSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async closeSession(
    merchantId: string,
    sessionId: string,
    operatorId: string,
    closingBalance: Money,
    closedAt: Date
  ): Promise<void> {
    const s = await this.findSessionById(merchantId, sessionId);
    if (s && s.isOpen()) {
      s.close(operatorId, closingBalance, closedAt);
    }
  }

  async addMovement(
    _merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money
  ): Promise<void> {
    this.movements.push({ sessionId, movementType, amount });
  }

  async getExpectedCash(_merchantId: string, sessionId: string): Promise<Money> {
    const sessionMovements = this.movements.filter(m => m.sessionId === sessionId);
    let total = Money.zero();

    for (const mov of sessionMovements) {
      if (mov.movementType === 'OPENING_BALANCE' || mov.movementType === 'SALE_RECEIPT' || mov.movementType === 'CREDIT_PAYMENT' || mov.movementType === 'SUPPLY') {
        total = total.add(mov.amount);
      } else if (mov.movementType === 'SALE_REFUND' || mov.movementType === 'BLEED') {
        total = total.subtract(mov.amount);
      }
    }

    return total;
  }
}

describe('Cash Session Use Cases', () => {
  let repository: MockCashSessionRepository;
  let audit: MockAuditService;
  let openUseCase: OpenCashSessionUseCase;
  let closeUseCase: CloseCashSessionUseCase;

  const MERCHANT_ID = 'merchant-test-123';

  beforeEach(() => {
    repository = new MockCashSessionRepository();
    audit = new MockAuditService();
    openUseCase = new OpenCashSessionUseCase(repository, audit);
    closeUseCase = new CloseCashSessionUseCase(repository, audit);
  });

  it('should open a cash session and record opening balance movement and audit', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', {
      openingBalance: '150.00',
    });

    expect(session.isOpen()).toBe(true);
    expect(session.openedBy).toBe('operador1');
    expect(session.openingBalance.toDecimal()).toBe('150.00');

    expect(repository.movements).toHaveLength(1);
    expect(repository.movements[0].movementType).toBe('OPENING_BALANCE');
    expect(repository.movements[0].amount.toDecimal()).toBe('150.00');

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0].eventType).toBe('CASH_SESSION_OPENED');
  });

  it('should prevent opening another session when one is already open', async () => {
    await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });

    await expect(
      openUseCase.execute(MERCHANT_ID, 'operador2', { openingBalance: '50.00' })
    ).rejects.toThrow(CashSessionAlreadyOpenError);
  });

  it('should close cash session smoothly when counted amount matches expected amount', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });

    // Simulate a cash sale receipt of R$ 50,00
    await repository.addMovement(MERCHANT_ID, session.id, 'SALE_RECEIPT', Money.fromDecimal('50.00'));

    // Expected is R$ 150,00, counted is R$ 150,00
    const result = await closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, {
      closingBalance: '150.00',
    });

    expect(result.expectedCash.toDecimal()).toBe('150.00');
    expect(result.closingBalance.toDecimal()).toBe('150.00');
    expect(result.difference.isZero()).toBe(true);

    const closedSession = await repository.findSessionById(MERCHANT_ID, session.id);
    expect(closedSession?.isOpen()).toBe(false);
    expect(closedSession?.closedBy).toBe('operador1');
  });

  it('should require discrepancy reason when counted amount differs from expected', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });

    // Expected is R$ 100,00, counted is R$ 95,00 (faltou R$ 5,00)
    await expect(
      closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, {
        closingBalance: '95.00',
        // No reason provided
      })
    ).rejects.toThrow(DiscrepancyReasonRequiredError);

    // Now provide valid reason
    const result = await closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, {
      closingBalance: '95.00',
      discrepancyReason: 'Troco dado a mais para cliente no início do turno',
    });

    expect(result.difference.toDecimal()).toBe('-5.00');

    const auditClose = audit.records.find(r => r.eventType === 'CASH_SESSION_CLOSED');
    expect(auditClose?.details.difference).toBe('-5.00');
    expect(auditClose?.details.reason).toBe('Troco dado a mais para cliente no início do turno');
  });

  it('should forbid another operator from closing a shift they did not open', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });

    await expect(
      closeUseCase.execute(MERCHANT_ID, session.id, 'operador2', false, {
        closingBalance: '100.00',
      })
    ).rejects.toThrow(CashSessionCloseNotAuthorizedError);
  });

  it('should allow the owner to close any operator session', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });

    // The owner closes operator1 session
    const result = await closeUseCase.execute(MERCHANT_ID, session.id, 'proprietaria', true, {
      closingBalance: '100.00',
    });

    expect(result.expectedCash.toDecimal()).toBe('100.00');
    const closed = await repository.findSessionById(MERCHANT_ID, session.id);
    expect(closed?.isOpen()).toBe(false);
    expect(closed?.closedBy).toBe('proprietaria');
  });

  it('should reject opening session with negative or invalid balance', async () => {
    await expect(
      openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '-50.00' })
    ).rejects.toThrow();

    await expect(
      openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: 'invalid-number' })
    ).rejects.toThrow();
  });

  it('should reject closing a session that does not exist or is already closed', async () => {
    await expect(
      closeUseCase.execute(MERCHANT_ID, 'sessao-inexistente', 'operador1', true, {
        closingBalance: '100.00',
      })
    ).rejects.toThrow(CashSessionNotOpenError);

    // Open and close
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });
    await closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, { closingBalance: '100.00' });

    // Try closing again
    await expect(
      closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, {
        closingBalance: '100.00',
      })
    ).rejects.toThrow(CashSessionNotOpenError);
  });

  it('should reject closing session with negative balance', async () => {
    const session = await openUseCase.execute(MERCHANT_ID, 'operador1', { openingBalance: '100.00' });
    await expect(
      closeUseCase.execute(MERCHANT_ID, session.id, 'operador1', false, {
        closingBalance: '-20.00',
      })
    ).rejects.toThrow();
  });
});
