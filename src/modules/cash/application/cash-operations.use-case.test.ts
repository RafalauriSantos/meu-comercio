import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { CashSession, CashMovementType, applyCashMovement } from '../domain/cash-session';
import { CashSessionRepository, CurrentCashSessionSummary } from '../domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  RecordCashDepositUseCase,
  RecordCashWithdrawalUseCase,
  NoOpenCashSessionError,
  InsufficientCashForWithdrawalError,
  InvalidCashOperationReasonError,
  InvalidCashOperationAmountError,
} from './cash-operations.use-case';

class InMemoryAuditService implements AuditPort {
  public records: Array<{
    merchantId: string;
    eventType: string;
    actorId: string;
    aggregateType: string;
    aggregateId: string;
    details: Record<string, unknown>;
  }> = [];

  async record(
    merchantId: string,
    eventType: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    this.records.push({ merchantId, eventType, actorId, aggregateType, aggregateId, details });
  }
}

class InMemoryCashSessionRepository implements CashSessionRepository {
  public sessions: Map<string, CashSession> = new Map();
  public movements: Array<{
    merchantId: string;
    sessionId: string;
    movementType: CashMovementType;
    amount: Money;
    saleId?: string | null;
  }> = [];

  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    const session = Array.from(this.sessions.values()).find(
      (s) => s.merchantId === merchantId && s.isOpen()
    );
    if (!session) return null;

    const expectedCash = await this.getExpectedCash(merchantId, session.id);
    return {
      id: session.id,
      merchantId: session.merchantId,
      openedBy: session.openedBy,
      openingBalance: session.openingBalance,
      openedAt: session.openedAt,
      expectedCash,
      movementsCount: this.movements.filter((m) => m.sessionId === session.id).length,
    };
  }

  async findSessionById(merchantId: string, sessionId: string): Promise<CashSession | null> {
    const session = this.sessions.get(sessionId);
    return session && session.merchantId === merchantId ? session : null;
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
    const session = await this.findSessionById(merchantId, sessionId);
    if (session && session.isOpen()) {
      session.close(operatorId, closingBalance, closedAt);
    }
  }

  async addMovement(
    merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money,
    saleId?: string | null
  ): Promise<void> {
    this.movements.push({ merchantId, sessionId, movementType, amount, saleId });
  }

  async getExpectedCash(merchantId: string, sessionId: string): Promise<Money> {
    const sessionMovements = this.movements.filter(
      (m) => m.merchantId === merchantId && m.sessionId === sessionId
    );
    return sessionMovements.reduce(
      (total, mov) => applyCashMovement(total, mov.movementType, mov.amount),
      Money.zero()
    );
  }
}

describe('Operações de Caixa (Sangria e Suprimento)', () => {
  let repository: InMemoryCashSessionRepository;
  let audit: InMemoryAuditService;
  let depositUseCase: RecordCashDepositUseCase;
  let withdrawalUseCase: RecordCashWithdrawalUseCase;

  const MERCHANT_ID = 'merchant-test-slice11';
  const OPERATOR_ID = 'operador-balcao-1';
  let activeSession: CashSession;

  beforeEach(async () => {
    repository = new InMemoryCashSessionRepository();
    audit = new InMemoryAuditService();
    depositUseCase = new RecordCashDepositUseCase(repository, audit);
    withdrawalUseCase = new RecordCashWithdrawalUseCase(repository, audit);

    // Abre um caixa com R$ 100,00 de fundo inicial
    activeSession = CashSession.create(MERCHANT_ID, OPERATOR_ID, Money.fromDecimal('100.00'));
    await repository.openSession(activeSession);
    await repository.addMovement(
      MERCHANT_ID,
      activeSession.id,
      'OPENING_BALANCE',
      activeSession.openingBalance
    );
  });

  describe('Suprimento de Caixa (DEPOSIT)', () => {
    it('deve registrar suprimento de troco com sucesso aumentando o dinheiro esperado', async () => {
      const initialCash = await repository.getExpectedCash(MERCHANT_ID, activeSession.id);
      expect(initialCash.toDecimal()).toBe('100.00');

      const result = await depositUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('50.00'),
        reason: 'Troco adicional fornecido pela gerência',
      });

      expect(result.expectedCash.toDecimal()).toBe('150.00');

      const expectedInRepo = await repository.getExpectedCash(MERCHANT_ID, activeSession.id);
      expect(expectedInRepo.toDecimal()).toBe('150.00');

      const movements = repository.movements.filter((m) => m.sessionId === activeSession.id);
      expect(movements).toHaveLength(2);
      expect(movements[1].movementType).toBe('DEPOSIT');
      expect(movements[1].amount.toDecimal()).toBe('50.00');
    });

    it('deve registrar auditoria compulsória ao efetuar suprimento', async () => {
      await depositUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('25.50'),
        reason: 'Moedas de 50 centavos e 1 real',
      });

      const auditEvent = audit.records.find((r) => r.eventType === 'CASH_DEPOSIT_RECORDED');
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.merchantId).toBe(MERCHANT_ID);
      expect(auditEvent?.actorId).toBe(OPERATOR_ID);
      expect(auditEvent?.aggregateId).toBe(activeSession.id);
      expect(auditEvent?.details.amount).toBe('25.50');
      expect(auditEvent?.details.reason).toBe('Moedas de 50 centavos e 1 real');
    });

    it('deve rejeitar suprimento se não houver caixa aberto ativo', async () => {
      const OTHER_MERCHANT = 'merchant-sem-caixa';

      await expect(
        depositUseCase.execute({
          merchantId: OTHER_MERCHANT,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('50.00'),
          reason: 'Tentativa sem caixa aberto',
        })
      ).rejects.toThrow(NoOpenCashSessionError);
    });

    it('deve rejeitar suprimento com motivo vazio ou com menos de 3 caracteres', async () => {
      await expect(
        depositUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('50.00'),
          reason: '  ',
        })
      ).rejects.toThrow(InvalidCashOperationReasonError);

      await expect(
        depositUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('50.00'),
          reason: 'Oi',
        })
      ).rejects.toThrow(InvalidCashOperationReasonError);
    });

    it('deve rejeitar suprimento com valor zero ou negativo', async () => {
      await expect(
        depositUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.zero(),
          reason: 'Valor nulo inválido',
        })
      ).rejects.toThrow(InvalidCashOperationAmountError);

      await expect(
        depositUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('-10.00'),
          reason: 'Valor negativo inválido',
        })
      ).rejects.toThrow(InvalidCashOperationAmountError);
    });
  });

  describe('Sangria de Caixa (WITHDRAWAL)', () => {
    it('deve registrar sangria com sucesso diminuindo o dinheiro esperado', async () => {
      const result = await withdrawalUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('40.00'),
        reason: 'Recolhimento para cofre de segurança',
      });

      expect(result.expectedCash.toDecimal()).toBe('60.00');

      const expectedInRepo = await repository.getExpectedCash(MERCHANT_ID, activeSession.id);
      expect(expectedInRepo.toDecimal()).toBe('60.00');

      const movements = repository.movements.filter((m) => m.sessionId === activeSession.id);
      expect(movements).toHaveLength(2);
      expect(movements[1].movementType).toBe('WITHDRAWAL');
      expect(movements[1].amount.toDecimal()).toBe('40.00');
    });

    it('deve registrar auditoria compulsória ao efetuar sangria', async () => {
      await withdrawalUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('80.00'),
        reason: 'Pagamento de boleto de fornecedor de pão',
      });

      const auditEvent = audit.records.find((r) => r.eventType === 'CASH_WITHDRAWAL_RECORDED');
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.merchantId).toBe(MERCHANT_ID);
      expect(auditEvent?.actorId).toBe(OPERATOR_ID);
      expect(auditEvent?.aggregateId).toBe(activeSession.id);
      expect(auditEvent?.details.amount).toBe('80.00');
      expect(auditEvent?.details.reason).toBe('Pagamento de boleto de fornecedor de pão');
    });

    it('deve rejeitar sangria com valor superior ao dinheiro disponível na gaveta', async () => {
      // O caixa tem R$ 100,00 disponíveis
      await expect(
        withdrawalUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('100.01'),
          reason: 'Tentativa de retirar mais que o saldo disponível',
        })
      ).rejects.toThrow(InsufficientCashForWithdrawalError);
    });

    it('deve permitir sangria no valor exato do saldo disponível esvaziando a gaveta para zero', async () => {
      const result = await withdrawalUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('100.00'),
        reason: 'Recolhimento total para o cofre',
      });

      expect(result.expectedCash.toDecimal()).toBe('0.00');
    });

    it('deve rejeitar sangria se não houver caixa aberto ativo', async () => {
      const OTHER_MERCHANT = 'merchant-sem-caixa';

      await expect(
        withdrawalUseCase.execute({
          merchantId: OTHER_MERCHANT,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('10.00'),
          reason: 'Sangria sem caixa',
        })
      ).rejects.toThrow(NoOpenCashSessionError);
    });

    it('deve rejeitar sangria com motivo com menos de 3 caracteres', async () => {
      await expect(
        withdrawalUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('10.00'),
          reason: 'ab',
        })
      ).rejects.toThrow(InvalidCashOperationReasonError);
    });

    it('deve rejeitar sangria com valor zero ou negativo', async () => {
      await expect(
        withdrawalUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.zero(),
          reason: 'Valor zero',
        })
      ).rejects.toThrow(InvalidCashOperationAmountError);

      await expect(
        withdrawalUseCase.execute({
          merchantId: MERCHANT_ID,
          operatorId: OPERATOR_ID,
          amount: Money.fromDecimal('-20.00'),
          reason: 'Valor negativo',
        })
      ).rejects.toThrow(InvalidCashOperationAmountError);
    });
  });

  describe('Conferência Cega Completa (Fórmula Matemática Integrada)', () => {
    it('deve calcular perfeitamente o dinheiro esperado com abertura, vendas, quitações, suprimentos e sangrias', async () => {
      // 1. Abertura: 100.00 (já feita no beforeEach)
      // 2. Venda em dinheiro (SALE_RECEIPT): +150.00
      await repository.addMovement(MERCHANT_ID, activeSession.id, 'SALE_RECEIPT', Money.fromDecimal('150.00'));

      // 3. Quitação de fiado em dinheiro (DEBT_PAYMENT): +50.00
      await repository.addMovement(MERCHANT_ID, activeSession.id, 'DEBT_PAYMENT', Money.fromDecimal('50.00'));

      // 4. Suprimento de troco (DEPOSIT): +30.00
      await depositUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('30.00'),
        reason: 'Moedas de troco do banco',
      });

      // 5. Sangria de caixa (WITHDRAWAL): -70.00
      await withdrawalUseCase.execute({
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        amount: Money.fromDecimal('70.00'),
        reason: 'Retirada para cofre',
      });

      // 6. Estorno de venda em dinheiro (CASH_CANCEL): -25.00
      await repository.addMovement(MERCHANT_ID, activeSession.id, 'CASH_CANCEL', Money.fromDecimal('25.00'));

      // Total esperado: 100 + 150 + 50 + 30 - 70 - 25 = 235.00
      const finalExpected = await repository.getExpectedCash(MERCHANT_ID, activeSession.id);
      expect(finalExpected.toDecimal()).toBe('235.00');

      const summary = await repository.findCurrentOpenSession(MERCHANT_ID);
      expect(summary?.expectedCash.toDecimal()).toBe('235.00');
      expect(summary?.movementsCount).toBe(6);
    });
  });
});
