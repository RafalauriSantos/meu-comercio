import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CreditMovement } from '../domain/credit-movement';
import { CustomerRepository } from '../domain/customer-repository.port';
import {
  CustomerCreditRepository,
  CustomerCreditBalance,
} from '../domain/customer-credit-repository.port';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';
import {
  CashSessionRepository,
  CurrentCashSessionSummary,
} from '@/modules/cash/domain/cash-session-repository.port';
import { CashSession, CashMovementType } from '@/modules/cash/domain/cash-session';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CustomerNotFoundError,
  CustomerAlreadyExistsError,
  CustomerInactiveError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
  DebtSettlementExceedsBalanceError,
  NoOpenCashSessionError,
} from '../domain/errors';
import { CreateCustomerUseCase } from './create-customer.use-case';
import { GetCustomerBalanceUseCase } from './get-customer-balance.use-case';
import { AuthorizeCreditSaleUseCase } from './authorize-credit-sale.use-case';
import { SettleCustomerDebtUseCase } from './settle-customer-debt.use-case';

class InMemoryCustomerRepository implements CustomerRepository {
  public customers: Map<string, Customer> = new Map();

  async save(customer: Customer): Promise<void> {
    this.customers.set(`${customer.merchantId}:${customer.id}`, customer);
  }

  async findById(merchantId: string, customerId: string): Promise<Customer | null> {
    return this.customers.get(`${merchantId}:${customerId}`) ?? null;
  }

  async findByPhone(merchantId: string, phone: string): Promise<Customer | null> {
    const normalized = phone.trim();
    for (const customer of this.customers.values()) {
      if (customer.merchantId === merchantId && customer.phone === normalized) {
        return customer;
      }
    }
    return null;
  }

  async findAllActive(merchantId: string): Promise<Customer[]> {
    const results: Customer[] = [];
    for (const customer of this.customers.values()) {
      if (customer.merchantId === merchantId && customer.active) {
        results.push(customer);
      }
    }
    return results;
  }

  async search(merchantId: string, query: string): Promise<Customer[]> {
    const q = query.trim().toLowerCase();
    const results: Customer[] = [];
    for (const customer of this.customers.values()) {
      if (customer.merchantId === merchantId && customer.name.toLowerCase().includes(q)) {
        results.push(customer);
      }
    }
    return results;
  }
}

class InMemoryCustomerCreditRepository implements CustomerCreditRepository {
  public movements: CreditMovement[] = [];

  async saveMovement(movement: CreditMovement): Promise<void> {
    this.movements.push(movement);
  }

  async getBalance(merchantId: string, customerId: string): Promise<CustomerCreditBalance> {
    let totalDebits = Money.zero();
    let totalCredits = Money.zero();

    for (const m of this.movements) {
      if (m.merchantId === merchantId && m.customerId === customerId) {
        if (m.type === 'DEBIT') {
          totalDebits = totalDebits.add(m.amount);
        } else if (m.type === 'CREDIT') {
          totalCredits = totalCredits.add(m.amount);
        }
      }
    }

    const currentDebt = totalDebits.subtract(totalCredits);
    return {
      currentDebt: currentDebt.isNegative() ? Money.zero() : currentDebt,
      totalDebits,
      totalCredits,
    };
  }

  async getMovementsByCustomerId(merchantId: string, customerId: string): Promise<CreditMovement[]> {
    return this.movements.filter(
      (m) => m.merchantId === merchantId && m.customerId === customerId
    );
  }
}

class InMemoryOwnerPinVerifier implements OwnerPinVerifier {
  public validPins: Map<string, string> = new Map();

  setPin(merchantId: string, ownerUsername: string, pin: string): void {
    this.validPins.set(`${merchantId}:${ownerUsername}`, pin);
  }

  async verifyOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<boolean> {
    const expected = this.validPins.get(`${merchantId}:${ownerUsername}`);
    return expected === pin;
  }
}

class InMemoryCashSessionRepository implements CashSessionRepository {
  public currentOpenSession: CurrentCashSessionSummary | null = null;
  public movements: Array<{
    merchantId: string;
    sessionId: string;
    movementType: CashMovementType;
    amount: Money;
    saleId?: string | null;
  }> = [];

  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    if (this.currentOpenSession && this.currentOpenSession.merchantId === merchantId) {
      return this.currentOpenSession;
    }
    return null;
  }

  async findSessionById(): Promise<CashSession | null> {
    return null;
  }

  async openSession(): Promise<void> {}

  async closeSession(): Promise<void> {}

  async addMovement(
    merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money,
    saleId?: string | null
  ): Promise<void> {
    this.movements.push({ merchantId, sessionId, movementType, amount, saleId });
  }

  async getExpectedCash(): Promise<Money> {
    return Money.zero();
  }
}

class InMemoryAuditPort implements AuditPort {
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
    this.records.push({
      merchantId,
      eventType,
      actorId,
      aggregateType,
      aggregateId,
      details,
    });
  }
}

describe('Slice 5: Customers & Credit / Fiado Use Cases', () => {
  let customerRepo: InMemoryCustomerRepository;
  let creditRepo: InMemoryCustomerCreditRepository;
  let pinVerifier: InMemoryOwnerPinVerifier;
  let cashRepo: InMemoryCashSessionRepository;
  let audit: InMemoryAuditPort;

  let createCustomerUseCase: CreateCustomerUseCase;
  let getCustomerBalanceUseCase: GetCustomerBalanceUseCase;
  let authorizeCreditSaleUseCase: AuthorizeCreditSaleUseCase;
  let settleCustomerDebtUseCase: SettleCustomerDebtUseCase;

  const MERCHANT_ID = 'merchant-test-123';
  const OTHER_MERCHANT_ID = 'merchant-other-456';
  const OPERATOR_ID = 'marcos';
  const OWNER_USERNAME = 'tatiane';
  const OWNER_PIN = '1234';

  beforeEach(() => {
    customerRepo = new InMemoryCustomerRepository();
    creditRepo = new InMemoryCustomerCreditRepository();
    pinVerifier = new InMemoryOwnerPinVerifier();
    cashRepo = new InMemoryCashSessionRepository();
    audit = new InMemoryAuditPort();

    pinVerifier.setPin(MERCHANT_ID, OWNER_USERNAME, OWNER_PIN);

    createCustomerUseCase = new CreateCustomerUseCase(customerRepo, audit);
    getCustomerBalanceUseCase = new GetCustomerBalanceUseCase(customerRepo, creditRepo);
    authorizeCreditSaleUseCase = new AuthorizeCreditSaleUseCase(
      customerRepo,
      creditRepo,
      pinVerifier,
      audit
    );
    settleCustomerDebtUseCase = new SettleCustomerDebtUseCase(
      customerRepo,
      creditRepo,
      cashRepo,
      audit
    );
  });

  describe('CreateCustomerUseCase (Critérios 5.1, 5.2, 5.4)', () => {
    it('should successfully create a customer with credit limit and record audit trail', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Dona Maria',
        phone: '11988887777',
        creditLimit: Money.fromDecimal('150.00'),
        operatorId: OPERATOR_ID,
      });

      expect(customer.id).toBeDefined();
      expect(customer.name).toBe('Dona Maria');
      expect(customer.phone).toBe('11988887777');
      expect(customer.creditLimit.toDecimal()).toBe('150.00');
      expect(customer.active).toBe(true);

      const saved = await customerRepo.findById(MERCHANT_ID, customer.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(customer.id);

      expect(audit.records).toHaveLength(1);
      expect(audit.records[0]).toMatchObject({
        merchantId: MERCHANT_ID,
        eventType: 'CUSTOMER_CREATED',
        actorId: OPERATOR_ID,
        aggregateType: 'CUSTOMER',
        aggregateId: customer.id,
      });
      expect(audit.records[0].details.creditLimit).toBe('150.00');
    });

    it('should create customer with default credit limit zero when omitted', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Seu Zé',
        phone: '11977776666',
        operatorId: OPERATOR_ID,
      });

      expect(customer.creditLimit.isZero()).toBe(true);
    });

    it('should reject creating customer with duplicate phone in the same merchant', async () => {
      await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Dona Maria',
        phone: '11988887777',
        operatorId: OPERATOR_ID,
      });

      await expect(
        createCustomerUseCase.execute({
          merchantId: MERCHANT_ID,
          name: 'Maria Silva',
          phone: '11988887777',
          operatorId: OPERATOR_ID,
        })
      ).rejects.toThrow(CustomerAlreadyExistsError);
    });

    it('should allow same phone in different merchants (multi-tenancy isolation)', async () => {
      const c1 = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Dona Maria',
        phone: '11988887777',
        operatorId: OPERATOR_ID,
      });

      const c2 = await createCustomerUseCase.execute({
        merchantId: OTHER_MERCHANT_ID,
        name: 'Dona Maria Loja 2',
        phone: '11988887777',
        operatorId: OPERATOR_ID,
      });

      expect(c1.id).not.toBe(c2.id);
      expect(c1.merchantId).toBe(MERCHANT_ID);
      expect(c2.merchantId).toBe(OTHER_MERCHANT_ID);
    });
  });

  describe('GetCustomerBalanceUseCase (Critérios 5.3, 5.5)', () => {
    it('should return initial zero debt and full available credit', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Carlos Oliveira',
        phone: '11966665555',
        creditLimit: Money.fromDecimal('200.00'),
        operatorId: OPERATOR_ID,
      });

      const balance = await getCustomerBalanceUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
      });

      expect(balance.customer.id).toBe(customer.id);
      expect(balance.currentDebt.isZero()).toBe(true);
      expect(balance.availableCredit.toDecimal()).toBe('200.00');
      expect(balance.creditLimit.toDecimal()).toBe('200.00');
      expect(balance.totalDebits.isZero()).toBe(true);
      expect(balance.totalCredits.isZero()).toBe(true);
    });

    it('should accurately calculate debt and available credit after debit movements', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Carlos Oliveira',
        phone: '11966665555',
        creditLimit: Money.fromDecimal('200.00'),
        operatorId: OPERATOR_ID,
      });

      await creditRepo.saveMovement(
        CreditMovement.create({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          type: 'DEBIT',
          amount: Money.fromDecimal('70.00'),
          operatorId: OPERATOR_ID,
        })
      );

      const balance = await getCustomerBalanceUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
      });

      expect(balance.currentDebt.toDecimal()).toBe('70.00');
      expect(balance.availableCredit.toDecimal()).toBe('130.00');
      expect(balance.totalDebits.toDecimal()).toBe('70.00');
      expect(balance.totalCredits.toDecimal()).toBe('0.00');
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      await expect(
        getCustomerBalanceUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: 'non-existing-id',
        })
      ).rejects.toThrow(CustomerNotFoundError);
    });
  });

  describe('AuthorizeCreditSaleUseCase (Critérios 5.3, 5.6)', () => {
    it('should automatically authorize credit sale within limit without requiring owner PIN', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Ana Souza',
        phone: '11955554444',
        creditLimit: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      const result = await authorizeCreditSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        saleAmount: Money.fromDecimal('80.00'),
        operatorId: OPERATOR_ID,
        saleId: 'sale-1',
      });

      expect(result.authorized).toBe(true);
      expect(result.requiresOwnerPin).toBe(false);
      expect(result.authorizedBy).toBeNull();
      expect(result.movement.type).toBe('DEBIT');
      expect(result.movement.amount.toDecimal()).toBe('80.00');

      const movements = await creditRepo.getMovementsByCustomerId(MERCHANT_ID, customer.id);
      expect(movements).toHaveLength(1);
      expect(movements[0].amount.toDecimal()).toBe('80.00');
    });

    it('should block credit sale with CreditLimitExceededError when exceeding limit without owner PIN', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Ana Souza',
        phone: '11955554444',
        creditLimit: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      await expect(
        authorizeCreditSaleUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          saleAmount: Money.fromDecimal('150.00'),
          operatorId: OPERATOR_ID,
        })
      ).rejects.toThrow(CreditLimitExceededError);

      const movements = await creditRepo.getMovementsByCustomerId(MERCHANT_ID, customer.id);
      expect(movements).toHaveLength(0);
    });

    it('should block credit sale with InvalidOwnerPinError when incorrect PIN is provided', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Ana Souza',
        phone: '11955554444',
        creditLimit: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      await expect(
        authorizeCreditSaleUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          saleAmount: Money.fromDecimal('150.00'),
          operatorId: OPERATOR_ID,
          ownerUsername: OWNER_USERNAME,
          ownerPin: '9999', // wrong pin
        })
      ).rejects.toThrow(InvalidOwnerPinError);

      const movements = await creditRepo.getMovementsByCustomerId(MERCHANT_ID, customer.id);
      expect(movements).toHaveLength(0);
    });

    it('should authorize sale exceeding limit when valid owner PIN is provided and record audit', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Ana Souza',
        phone: '11955554444',
        creditLimit: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      const result = await authorizeCreditSaleUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        saleAmount: Money.fromDecimal('150.00'),
        operatorId: OPERATOR_ID,
        ownerUsername: OWNER_USERNAME,
        ownerPin: OWNER_PIN,
        saleId: 'sale-limit-override',
      });

      expect(result.authorized).toBe(true);
      expect(result.requiresOwnerPin).toBe(true);
      expect(result.authorizedBy).toBe(OWNER_USERNAME);
      expect(result.movement.amount.toDecimal()).toBe('150.00');
      expect(result.movement.authorizedBy).toBe(OWNER_USERNAME);

      const overrideAudit = audit.records.find(
        (r) => r.eventType === 'CREDIT_SALE_LIMIT_AUTHORIZED'
      );
      expect(overrideAudit).toBeDefined();
      expect(overrideAudit?.actorId).toBe(OPERATOR_ID);
      expect(overrideAudit?.details.authorizedBy).toBe(OWNER_USERNAME);
      expect(overrideAudit?.details.saleAmount).toBe('150.00');
    });

    it('should reject credit sale if customer is inactive', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Inativo Silva',
        phone: '11944443333',
        creditLimit: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      const deactivated = customer.deactivate();
      await customerRepo.save(deactivated);

      await expect(
        authorizeCreditSaleUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          saleAmount: Money.fromDecimal('50.00'),
          operatorId: OPERATOR_ID,
        })
      ).rejects.toThrow(CustomerInactiveError);
    });
  });

  describe('SettleCustomerDebtUseCase (Critérios 5.3, 5.7)', () => {
    it('should require active open cash session to settle customer debt', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Marcos Roberto',
        phone: '11933332222',
        creditLimit: Money.fromDecimal('300.00'),
        operatorId: OPERATOR_ID,
      });

      await creditRepo.saveMovement(
        CreditMovement.create({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          type: 'DEBIT',
          amount: Money.fromDecimal('100.00'),
          operatorId: OPERATOR_ID,
        })
      );

      // No open session in cashRepo
      await expect(
        settleCustomerDebtUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          amount: Money.fromDecimal('50.00'),
          operatorId: OPERATOR_ID,
        })
      ).rejects.toThrow(NoOpenCashSessionError);
    });

    it('should reject debt settlement when amount exceeds current debt', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Marcos Roberto',
        phone: '11933332222',
        creditLimit: Money.fromDecimal('300.00'),
        operatorId: OPERATOR_ID,
      });

      await creditRepo.saveMovement(
        CreditMovement.create({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          type: 'DEBIT',
          amount: Money.fromDecimal('100.00'),
          operatorId: OPERATOR_ID,
        })
      );

      cashRepo.currentOpenSession = {
        id: 'session-open-1',
        merchantId: MERCHANT_ID,
        openedBy: OPERATOR_ID,
        openingBalance: Money.fromDecimal('100.00'),
        openedAt: new Date(),
        expectedCash: Money.fromDecimal('100.00'),
        movementsCount: 0,
      };

      await expect(
        settleCustomerDebtUseCase.execute({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          amount: Money.fromDecimal('150.00'), // Exceeds 100.00 debt
          operatorId: OPERATOR_ID,
        })
      ).rejects.toThrow(DebtSettlementExceedsBalanceError);
    });

    it('should successfully settle partial debt, update cash drawer and record immutable audit', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Marcos Roberto',
        phone: '11933332222',
        creditLimit: Money.fromDecimal('300.00'),
        operatorId: OPERATOR_ID,
      });

      await creditRepo.saveMovement(
        CreditMovement.create({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          type: 'DEBIT',
          amount: Money.fromDecimal('100.00'),
          operatorId: OPERATOR_ID,
        })
      );

      cashRepo.currentOpenSession = {
        id: 'session-open-1',
        merchantId: MERCHANT_ID,
        openedBy: OPERATOR_ID,
        openingBalance: Money.fromDecimal('100.00'),
        openedAt: new Date(),
        expectedCash: Money.fromDecimal('100.00'),
        movementsCount: 0,
      };

      const result = await settleCustomerDebtUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        amount: Money.fromDecimal('40.00'),
        operatorId: OPERATOR_ID,
        note: 'Pagamento parcial em dinheiro',
      });

      expect(result.remainingDebt.toDecimal()).toBe('60.00');
      expect(result.cashSessionId).toBe('session-open-1');
      expect(result.movement.type).toBe('CREDIT');
      expect(result.movement.amount.toDecimal()).toBe('40.00');

      // Cash drawer movement verified
      expect(cashRepo.movements).toHaveLength(1);
      expect(cashRepo.movements[0].movementType).toBe('DEBT_PAYMENT');
      expect(cashRepo.movements[0].amount.toDecimal()).toBe('40.00');
      expect(cashRepo.movements[0].sessionId).toBe('session-open-1');

      // Audit trail verified
      const settlementAudit = audit.records.find((r) => r.eventType === 'CUSTOMER_DEBT_SETTLED');
      expect(settlementAudit).toBeDefined();
      expect(settlementAudit?.actorId).toBe(OPERATOR_ID);
      expect(settlementAudit?.details.paymentAmount).toBe('40.00');
      expect(settlementAudit?.details.previousDebt).toBe('100.00');
      expect(settlementAudit?.details.remainingDebt).toBe('60.00');
      expect(settlementAudit?.details.cashSessionId).toBe('session-open-1');

      // Check balance query reflects updated debt
      const balance = await getCustomerBalanceUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
      });
      expect(balance.currentDebt.toDecimal()).toBe('60.00');
      expect(balance.availableCredit.toDecimal()).toBe('240.00');
    });

    it('should successfully settle total debt down to zero', async () => {
      const customer = await createCustomerUseCase.execute({
        merchantId: MERCHANT_ID,
        name: 'Marcos Roberto',
        phone: '11933332222',
        creditLimit: Money.fromDecimal('300.00'),
        operatorId: OPERATOR_ID,
      });

      await creditRepo.saveMovement(
        CreditMovement.create({
          merchantId: MERCHANT_ID,
          customerId: customer.id,
          type: 'DEBIT',
          amount: Money.fromDecimal('100.00'),
          operatorId: OPERATOR_ID,
        })
      );

      cashRepo.currentOpenSession = {
        id: 'session-open-1',
        merchantId: MERCHANT_ID,
        openedBy: OPERATOR_ID,
        openingBalance: Money.fromDecimal('100.00'),
        openedAt: new Date(),
        expectedCash: Money.fromDecimal('100.00'),
        movementsCount: 0,
      };

      const result = await settleCustomerDebtUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        amount: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      });

      expect(result.remainingDebt.toDecimal()).toBe('0.00');

      const balance = await getCustomerBalanceUseCase.execute({
        merchantId: MERCHANT_ID,
        customerId: customer.id,
      });
      expect(balance.currentDebt.isZero()).toBe(true);
      expect(balance.availableCredit.toDecimal()).toBe('300.00');
    });
  });
});
