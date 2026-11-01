import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment } from '../domain/payment';
import { SaleRepository } from '../domain/sale-repository.port';
import { InventoryRepository, InventoryMovementType } from '@/modules/inventory/domain/inventory-repository.port';
import { InventoryItem } from '@/modules/inventory/domain/inventory-item';
import { CashSessionRepository, CurrentCashSessionSummary } from '@/modules/cash/domain/cash-session-repository.port';
import { CashSession, CashMovementType, applyCashMovement } from '@/modules/cash/domain/cash-session';
import { OwnerPinVerifier } from '@/modules/customers/domain/owner-pin-verifier.port';
import { CustomerCreditRepository } from '@/modules/customers/domain/customer-credit-repository.port';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CancelSaleUseCase,
  SaleAlreadyCancelledError,
  SaleNotFoundError,
  InsufficientCashForRefundError,
} from './cancel-sale.use-case';
import { InvalidOwnerPinError, NoOpenCashSessionError } from '@/modules/customers/domain/errors';

// Mocks em memória
class InMemorySaleRepository implements SaleRepository {
  public sales: Map<string, Sale> = new Map();

  async findById(merchantId: string, saleId: string): Promise<Sale | null> {
    const sale = this.sales.get(saleId);
    return sale && sale.merchantId === merchantId ? sale : null;
  }

  async findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null> {
    return Array.from(this.sales.values()).find(
      (s) => s.merchantId === merchantId && s.idempotencyKey === idempotencyKey
    ) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id, sale);
  }
}

class InMemoryInventoryRepository implements InventoryRepository {
  public items: Map<string, InventoryItem> = new Map();
  public movements: Array<{
    merchantId: string;
    productId: string;
    movementType: InventoryMovementType;
    quantity: number;
    reason: string;
    actorId: string;
  }> = [];

  async findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null> {
    return this.items.get(`${merchantId}:${productId}`) ?? null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(`${item.merchantId}:${item.productId}`, item);
  }

  async addMovement(
    merchantId: string,
    productId: string,
    movementType: InventoryMovementType,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<void> {
    this.movements.push({ merchantId, productId, movementType, quantity, reason, actorId });
  }

  async getAvailableQuantity(merchantId: string, productId: string): Promise<number> {
    const item = await this.findByProductId(merchantId, productId);
    return item?.availableQuantity ?? 0;
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

class InMemoryOwnerPinVerifier implements OwnerPinVerifier {
  public validPins: Map<string, string> = new Map(); // merchantId -> validPin

  async verifyOwnerPin(merchantId: string, _ownerUsername: string, pin: string): Promise<boolean> {
    return this.validPins.get(merchantId) === pin;
  }
}

class InMemoryCustomerCreditRepository implements CustomerCreditRepository {
  public movements: CreditMovement[] = [];

  async saveMovement(movement: CreditMovement): Promise<void> {
    this.movements.push(movement);
  }

  async getBalance(merchantId: string, customerId: string) {
    const customerMovements = this.movements.filter(
      (m) => m.merchantId === merchantId && m.customerId === customerId
    );
    const totalDebits = customerMovements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum.add(m.amount), Money.zero());
    const totalCredits = customerMovements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum.add(m.amount), Money.zero());
    const currentDebt = totalDebits.subtract(totalCredits);

    return {
      currentDebt: currentDebt.isNegative() ? Money.zero() : currentDebt,
      totalDebits,
      totalCredits,
    };
  }

  async getMovementsByCustomerId(merchantId: string, customerId: string) {
    return this.movements.filter(
      (m) => m.merchantId === merchantId && m.customerId === customerId
    );
  }
}

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

describe('CancelSaleUseCase — Cancelamento e Estorno de Venda', () => {
  let saleRepo: InMemorySaleRepository;
  let inventoryRepo: InMemoryInventoryRepository;
  let cashRepo: InMemoryCashSessionRepository;
  let pinVerifier: InMemoryOwnerPinVerifier;
  let creditRepo: InMemoryCustomerCreditRepository;
  let audit: InMemoryAuditService;
  let cancelSaleUseCase: CancelSaleUseCase;

  const MERCHANT_ID = 'merchant-test-cancel';
  const OPERATOR_ID = 'operador-caixa';
  const VALID_OWNER_PIN = '123456';
  const PRODUCT_ID = 'prod-arroz-1';
  let activeSession: CashSession;

  beforeEach(async () => {
    saleRepo = new InMemorySaleRepository();
    inventoryRepo = new InMemoryInventoryRepository();
    cashRepo = new InMemoryCashSessionRepository();
    pinVerifier = new InMemoryOwnerPinVerifier();
    creditRepo = new InMemoryCustomerCreditRepository();
    audit = new InMemoryAuditService();

    pinVerifier.validPins.set(MERCHANT_ID, VALID_OWNER_PIN);

    cancelSaleUseCase = new CancelSaleUseCase(
      saleRepo,
      inventoryRepo,
      cashRepo,
      pinVerifier,
      audit,
      creditRepo
    );

    // Abre sessão de caixa com R$ 200,00
    activeSession = CashSession.create(MERCHANT_ID, OPERATOR_ID, Money.fromDecimal('200.00'));
    await cashRepo.openSession(activeSession);
    await cashRepo.addMovement(
      MERCHANT_ID,
      activeSession.id,
      'OPENING_BALANCE',
      activeSession.openingBalance
    );

    // Cria item no estoque com saldo 10 unidades
    const inventoryItem = new InventoryItem({
      merchantId: MERCHANT_ID,
      productId: PRODUCT_ID,
      availableQuantity: 10,
      updatedAt: new Date(),
    });
    await inventoryRepo.save(inventoryItem);
  });

  function createSampleConfirmedSale(payment: Payment): Sale {
    const sale = Sale.create(MERCHANT_ID, activeSession.id, OPERATOR_ID);
    const item = SaleItem.create(PRODUCT_ID, 'Arroz 5kg', Money.fromDecimal('20.00'), 2); // total 40.00
    sale.addItem(item);
    sale.confirmPayments([payment]);
    return sale;
  }

  it('deve cancelar venda em dinheiro com sucesso autenticado pelo PIN da dona', async () => {
    const cashPayment = Payment.create('CASH', Money.fromDecimal('40.00'), {
      receivedAmount: Money.fromDecimal('50.00'),
    });
    const sale = createSampleConfirmedSale(cashPayment);
    await saleRepo.save(sale);

    // Registra recebimento no caixa como ocorreria na venda
    await cashRepo.addMovement(MERCHANT_ID, activeSession.id, 'SALE_RECEIPT', Money.fromDecimal('40.00'), sale.id);

    const result = await cancelSaleUseCase.execute({
      merchantId: MERCHANT_ID,
      saleId: sale.id,
      operatorId: OPERATOR_ID,
      ownerPin: VALID_OWNER_PIN,
      reason: 'Cliente desistiu da compra antes de sair da loja',
    });

    expect(result.status).toBe('CANCELLED');

    // Verifica que a venda no repositório foi cancelada
    const savedSale = await saleRepo.findById(MERCHANT_ID, sale.id);
    expect(savedSale?.status).toBe('CANCELLED');

    // Devolução física ao estoque: 10 + 2 = 12 unidades
    const itemInStock = await inventoryRepo.findByProductId(MERCHANT_ID, PRODUCT_ID);
    expect(itemInStock?.availableQuantity).toBe(12);

    const stockMovements = inventoryRepo.movements.filter((m) => m.productId === PRODUCT_ID);
    expect(stockMovements).toHaveLength(1);
    expect(stockMovements[0].movementType).toBe('RETURN');
    expect(stockMovements[0].quantity).toBe(2);

    // Estorno do dinheiro na gaveta com CASH_CANCEL
    const cashMovements = cashRepo.movements.filter((m) => m.sessionId === activeSession.id);
    const cancelMov = cashMovements.find((m) => m.movementType === 'CASH_CANCEL');
    expect(cancelMov).toBeDefined();
    expect(cancelMov?.amount.toDecimal()).toBe('40.00');

    // Dinheiro esperado pós estorno: 200 (fundo) + 40 (venda) - 40 (estorno) = 200.00
    const finalExpected = await cashRepo.getExpectedCash(MERCHANT_ID, activeSession.id);
    expect(finalExpected.toDecimal()).toBe('200.00');

    // Auditoria compulsória
    const auditRecord = audit.records.find((r) => r.eventType === 'SALE_CANCELLED');
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.actorId).toBe(OPERATOR_ID);
    expect(auditRecord?.aggregateId).toBe(sale.id);
  });

  it('deve rejeitar cancelamento imediatamente se o PIN da dona estiver incorreto', async () => {
    const cashPayment = Payment.create('CASH', Money.fromDecimal('40.00'));
    const sale = createSampleConfirmedSale(cashPayment);
    await saleRepo.save(sale);

    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: sale.id,
        operatorId: OPERATOR_ID,
        ownerPin: '999999', // PIN inválido
        reason: 'Tentativa não autorizada',
      })
    ).rejects.toThrow(InvalidOwnerPinError);
  });

  it('deve rejeitar cancelamento se a venda já estiver cancelada', async () => {
    const cashPayment = Payment.create('CASH', Money.fromDecimal('40.00'));
    const sale = createSampleConfirmedSale(cashPayment);
    sale.cancel(); // Já cancelada
    await saleRepo.save(sale);

    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: sale.id,
        operatorId: OPERATOR_ID,
        ownerPin: VALID_OWNER_PIN,
        reason: 'Segunda tentativa de cancelamento',
      })
    ).rejects.toThrow(SaleAlreadyCancelledError);
  });

  it('deve rejeitar cancelamento se a venda estiver com status PENDING_PAYMENT (não confirmada)', async () => {
    const sale = Sale.create(MERCHANT_ID, activeSession.id, OPERATOR_ID);
    const item = SaleItem.create(PRODUCT_ID, 'Arroz 5kg', Money.fromDecimal('20.00'), 1);
    sale.addItem(item);
    await saleRepo.save(sale);

    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: sale.id,
        operatorId: OPERATOR_ID,
        ownerPin: VALID_OWNER_PIN,
        reason: 'Venda nem sequer paga',
      })
    ).rejects.toThrow('Apenas vendas confirmadas podem ser canceladas.');
  });

  it('deve rejeitar estorno de venda em dinheiro se NÃO houver sessão de caixa aberta para devolução', async () => {
    const cashPayment = Payment.create('CASH', Money.fromDecimal('40.00'));
    const sale = createSampleConfirmedSale(cashPayment);
    await saleRepo.save(sale);

    // Fecha o caixa ativo
    activeSession.close(OPERATOR_ID, Money.fromDecimal('200.00'), new Date());

    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: sale.id,
        operatorId: OPERATOR_ID,
        ownerPin: VALID_OWNER_PIN,
        reason: 'Sem caixa aberto para retirar o dinheiro',
      })
    ).rejects.toThrow(NoOpenCashSessionError);
  });

  it('deve rejeitar cancelamento se o saldo em dinheiro no caixa for insuficiente para devolver o valor', async () => {
    // Venda de R$ 300,00 em dinheiro
    const sale = Sale.create(MERCHANT_ID, activeSession.id, OPERATOR_ID);
    const item = SaleItem.create(PRODUCT_ID, 'Arroz 5kg', Money.fromDecimal('50.00'), 6);
    sale.addItem(item);
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('300.00'))]);
    await saleRepo.save(sale);

    // O caixa só tem R$ 200,00 de saldo
    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: sale.id,
        operatorId: OPERATOR_ID,
        ownerPin: VALID_OWNER_PIN,
        reason: 'Caixa com saldo menor que o reembolso exigido',
      })
    ).rejects.toThrow(InsufficientCashForRefundError);
  });

  it('deve estornar fiado com crédito compensatório (CREDIT) no extrato do cliente', async () => {
    const CUSTOMER_ID = 'cust-dona-maria-1';

    // Cria venda a fiado com método TAB
    const sale = Sale.create(MERCHANT_ID, activeSession.id, OPERATOR_ID);
    const item = SaleItem.create(PRODUCT_ID, 'Arroz 5kg', Money.fromDecimal('40.00'), 1);
    sale.addItem(item);
    sale.confirmPayments([
      Payment.create('TAB', Money.fromDecimal('40.00'), { externalReference: CUSTOMER_ID }),
    ]);
    await saleRepo.save(sale);

    // Registra débito original no extrato de fiado
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_ID,
        customerId: CUSTOMER_ID,
        type: 'DEBIT',
        amount: Money.fromDecimal('40.00'),
        operatorId: OPERATOR_ID,
        saleId: sale.id,
        note: 'Compra a prazo na caderneta',
      })
    );

    // Dívida antes do cancelamento: 40.00
    const balanceBefore = await creditRepo.getBalance(MERCHANT_ID, CUSTOMER_ID);
    expect(balanceBefore.currentDebt.toDecimal()).toBe('40.00');

    const result = await cancelSaleUseCase.execute({
      merchantId: MERCHANT_ID,
      saleId: sale.id,
      operatorId: OPERATOR_ID,
      ownerPin: VALID_OWNER_PIN,
      reason: 'Cancelamento de fiado autorizado',
    });

    expect(result.status).toBe('CANCELLED');

    // Dívida depois do cancelamento: 40.00 - 40.00 = 0.00
    const balanceAfter = await creditRepo.getBalance(MERCHANT_ID, CUSTOMER_ID);
    expect(balanceAfter.currentDebt.toDecimal()).toBe('0.00');

    // Movimento compensatório CREDIT lançado
    const compensations = creditRepo.movements.filter(
      (m) => m.customerId === CUSTOMER_ID && m.type === 'CREDIT'
    );
    expect(compensations).toHaveLength(1);
    expect(compensations[0].amount.toDecimal()).toBe('40.00');
    expect(compensations[0].saleId).toBe(sale.id);
  });

  it('deve rejeitar cancelamento para venda inexistente', async () => {
    await expect(
      cancelSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        saleId: 'venda-que-nunca-existiu',
        operatorId: OPERATOR_ID,
        ownerPin: VALID_OWNER_PIN,
        reason: 'ID falso',
      })
    ).rejects.toThrow(SaleNotFoundError);
  });
});
