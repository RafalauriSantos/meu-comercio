import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createCustomerPost, GET as listCustomersGet } from './route';
import { GET as searchCustomersGet } from './search/route';
import { GET as getCustomerBalanceGet } from './[id]/balance/route';
import { POST as settleCustomerDebtPost } from './[id]/settle/route';
import { POST as authorizeCreditSalePost } from './[id]/authorize-credit/route';
import { Money } from '@/shared/domain/money';
import { Customer } from '@/modules/customers/domain/customer';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  CustomerInactiveError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
  DebtSettlementExceedsBalanceError,
  NoOpenCashSessionError,
} from '@/modules/customers/domain/errors';

// Mocks
const mockRequireAuthenticatedSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthenticatedSession: () => mockRequireAuthenticatedSession(),
  requireAuthSession: () => mockRequireAuthenticatedSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

const mockExecuteCreateCustomer = vi.fn();
vi.mock('@/modules/customers/application/create-customer.use-case', () => ({
  CreateCustomerUseCase: class MockCreateCustomerUseCase {
    execute = mockExecuteCreateCustomer;
  },
}));

const mockExecuteGetCustomerBalance = vi.fn();
vi.mock('@/modules/customers/application/get-customer-balance.use-case', () => ({
  GetCustomerBalanceUseCase: class MockGetCustomerBalanceUseCase {
    execute = mockExecuteGetCustomerBalance;
  },
}));

const mockExecuteSettleCustomerDebt = vi.fn();
vi.mock('@/modules/customers/application/settle-customer-debt.use-case', () => ({
  SettleCustomerDebtUseCase: class MockSettleCustomerDebtUseCase {
    execute = mockExecuteSettleCustomerDebt;
  },
}));

const mockExecuteAuthorizeCreditSale = vi.fn();
vi.mock('@/modules/customers/application/authorize-credit-sale.use-case', () => ({
  AuthorizeCreditSaleUseCase: class MockAuthorizeCreditSaleUseCase {
    execute = mockExecuteAuthorizeCreditSale;
  },
}));

const mockSearchCustomers = vi.fn();
const mockFindAllActiveCustomers = vi.fn();
vi.mock('@/modules/customers/infrastructure/drizzle-customer-repository', () => ({
  DrizzleCustomerRepository: class MockDrizzleCustomerRepository {
    search = mockSearchCustomers;
    findAllActive = mockFindAllActiveCustomers;
  },
}));

describe('Customers API Routes', () => {
  const merchantId = 'merchant-test-456';
  const username = 'operador-test';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({
      userId: 'user-1',
      merchantId,
      username,
      roles: ['ROLE_OPERATOR'],
    });
  });

  describe('POST /api/customers', () => {
    it('deve retornar 401 se usuário não estiver autenticado', async () => {
      mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

      const request = new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Seu Zé', phone: '11999998888' }),
      });

      const response = await createCustomerPost(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toBe('Não autorizado.');
    });

    it('deve retornar 400 se o corpo da requisição for inválido (faltando nome)', async () => {
      const request = new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        body: JSON.stringify({ phone: '11999998888' }),
      });

      const response = await createCustomerPost(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toBe('Dados de cliente inválidos.');
    });

    it('deve retornar 409 se cliente com mesmo telefone já existir', async () => {
      mockExecuteCreateCustomer.mockRejectedValue(new CustomerAlreadyExistsError('11999998888'));

      const request = new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00' }),
      });

      const response = await createCustomerPost(request);
      expect(response.status).toBe(409);
    });

    it('deve retornar 201 com dados do cliente criado', async () => {
      const createdCustomer = Customer.create({
        id: 'cust-uuid-1',
        merchantId,
        name: 'Seu Zé',
        phone: '11999998888',
        creditLimit: Money.fromDecimal('150.00'),
      });

      mockExecuteCreateCustomer.mockResolvedValue(createdCustomer);

      const request = new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Seu Zé', phone: '11999998888', creditLimit: '150.00' }),
      });

      const response = await createCustomerPost(request);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('cust-uuid-1');
      expect(data.name).toBe('Seu Zé');
      expect(data.phone).toBe('11999998888');
      expect(data.creditLimit).toBe('150.00');
    });
  });

  describe('GET /api/customers e GET /api/customers/search', () => {
    it('deve retornar 200 com lista de clientes ativos em /api/customers', async () => {
      const cust = Customer.create({
        id: 'c1',
        merchantId,
        name: 'Maria Silva',
        phone: '11988887777',
      });
      mockFindAllActiveCustomers.mockResolvedValue([cust]);

      const response = await listCustomersGet();
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.items).toHaveLength(1);
      expect(json.items[0].name).toBe('Maria Silva');
    });

    it('deve pesquisar clientes por query em /api/customers/search', async () => {
      const cust = Customer.create({
        id: 'c2',
        merchantId,
        name: 'João Souza',
        phone: '11977776666',
      });
      mockSearchCustomers.mockResolvedValue([cust]);

      const request = new NextRequest('http://localhost:3000/api/customers/search?q=Joao');
      const response = await searchCustomersGet(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.items).toHaveLength(1);
      expect(json.items[0].name).toBe('João Souza');
      expect(mockSearchCustomers).toHaveBeenCalledWith(merchantId, 'Joao');
    });
  });

  describe('GET /api/customers/[id]/balance', () => {
    it('deve retornar 404 se cliente não for encontrado', async () => {
      mockExecuteGetCustomerBalance.mockRejectedValue(new CustomerNotFoundError('cust-999'));

      const request = new NextRequest('http://localhost:3000/api/customers/cust-999/balance');
      const response = await getCustomerBalanceGet(request, {
        params: Promise.resolve({ id: 'cust-999' }),
      });

      expect(response.status).toBe(404);
    });

    it('deve retornar 200 com saldo devedor e limite de crédito disponível', async () => {
      const customer = Customer.create({
        id: 'cust-1',
        merchantId,
        name: 'Ana Costa',
        phone: '11966665555',
        creditLimit: Money.fromDecimal('200.00'),
      });

      mockExecuteGetCustomerBalance.mockResolvedValue({
        customer,
        currentDebt: Money.fromDecimal('50.00'),
        availableCredit: Money.fromDecimal('150.00'),
        creditLimit: Money.fromDecimal('200.00'),
        totalDebits: Money.fromDecimal('100.00'),
        totalCredits: Money.fromDecimal('50.00'),
      });

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/balance');
      const response = await getCustomerBalanceGet(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.customerId).toBe('cust-1');
      expect(json.currentDebt).toBe('50.00');
      expect(json.availableCredit).toBe('150.00');
      expect(json.creditLimit).toBe('200.00');
    });
  });

  describe('POST /api/customers/[id]/settle', () => {
    it('deve retornar 400 se não houver caixa aberto ativo', async () => {
      mockExecuteSettleCustomerDebt.mockRejectedValue(new NoOpenCashSessionError());

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/settle', {
        method: 'POST',
        body: JSON.stringify({ amount: '50.00' }),
      });

      const response = await settleCustomerDebtPost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 se valor de quitação exceder a dívida', async () => {
      mockExecuteSettleCustomerDebt.mockRejectedValue(new DebtSettlementExceedsBalanceError());

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/settle', {
        method: 'POST',
        body: JSON.stringify({ amount: '500.00' }),
      });

      const response = await settleCustomerDebtPost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(400);
    });

    it('deve retornar 400 se cliente estiver inativo ao quitar débito', async () => {
      mockExecuteSettleCustomerDebt.mockRejectedValue(new CustomerInactiveError('cust-1'));

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/settle', {
        method: 'POST',
        body: JSON.stringify({ amount: '50.00' }),
      });

      const response = await settleCustomerDebtPost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toContain('inactive');
    });

    it('deve quitar dívida e retornar 200 com saldo remanescente', async () => {
      const movement = CreditMovement.create({
        id: 'mov-1',
        merchantId,
        customerId: 'cust-1',
        type: 'CREDIT',
        amount: Money.fromDecimal('50.00'),
        operatorId: username,
        cashSessionId: 'session-123',
      });

      mockExecuteSettleCustomerDebt.mockResolvedValue({
        movement,
        remainingDebt: Money.fromDecimal('25.00'),
        cashSessionId: 'session-123',
      });

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/settle', {
        method: 'POST',
        body: JSON.stringify({ amount: '50.00', note: 'Pagamento parcial' }),
      });

      const response = await settleCustomerDebtPost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.movementId).toBe('mov-1');
      expect(json.amount).toBe('50.00');
      expect(json.remainingDebt).toBe('25.00');
      expect(json.cashSessionId).toBe('session-123');
    });
  });

  describe('POST /api/customers/[id]/authorize-credit', () => {
    it('deve retornar 403 se limite for excedido e nenhum PIN for informado', async () => {
      mockExecuteAuthorizeCreditSale.mockRejectedValue(new CreditLimitExceededError());

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/authorize-credit', {
        method: 'POST',
        body: JSON.stringify({ saleAmount: '250.00' }),
      });

      const response = await authorizeCreditSalePost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toContain('Limite de crédito excedido');
    });

    it('deve retornar 403 se PIN da dona informado for incorreto', async () => {
      mockExecuteAuthorizeCreditSale.mockRejectedValue(new InvalidOwnerPinError());

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/authorize-credit', {
        method: 'POST',
        body: JSON.stringify({ saleAmount: '250.00', ownerPin: '9999' }),
      });

      const response = await authorizeCreditSalePost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toContain('PIN de autorização da proprietária inválido');
    });

    it('deve autorizar com sucesso com PIN da proprietária e retornar 200', async () => {
      const movement = CreditMovement.create({
        id: 'mov-debit-1',
        merchantId,
        customerId: 'cust-1',
        type: 'DEBIT',
        amount: Money.fromDecimal('250.00'),
        operatorId: username,
        authorizedBy: 'owner',
      });

      mockExecuteAuthorizeCreditSale.mockResolvedValue({
        authorized: true,
        movement,
        requiresOwnerPin: true,
        authorizedBy: 'owner',
      });

      const request = new NextRequest('http://localhost:3000/api/customers/cust-1/authorize-credit', {
        method: 'POST',
        body: JSON.stringify({ saleAmount: '250.00', ownerPin: '1234' }),
      });

      const response = await authorizeCreditSalePost(request, {
        params: Promise.resolve({ id: 'cust-1' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.authorized).toBe(true);
      expect(json.requiresOwnerPin).toBe(true);
      expect(json.authorizedBy).toBe('owner');
      expect(json.saleAmount).toBe('250.00');
    });
  });
});
