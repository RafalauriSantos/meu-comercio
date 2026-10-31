import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { GET } from './[id]/route';
import { Money } from '@/shared/domain/money';
import { Sale } from '@/modules/sales/domain/sale';
import { SaleItem } from '@/modules/sales/domain/sale-item';
import { Payment } from '@/modules/sales/domain/payment';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  OpenCashSessionRequiredError,
  DuplicateSaleRequestError,
  ProductNotFoundError,
} from '@/modules/sales/application/create-sale.use-case';

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

const mockExecuteCreateSale = vi.fn();
vi.mock('@/modules/sales/application/create-sale.use-case', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/sales/application/create-sale.use-case')>();
  return {
    ...actual,
    CreateSaleUseCase: class MockCreateSaleUseCase {
      execute = mockExecuteCreateSale;
    },
  };
});

const mockExecuteGetSaleById = vi.fn();
vi.mock('@/modules/sales/application/get-sale-by-id.use-case', () => ({
  GetSaleByIdUseCase: class MockGetSaleByIdUseCase {
    execute = mockExecuteGetSaleById;
  },
}));

describe('Sales API Routes', () => {
  const merchantId = 'merchant-test-123';
  const username = 'operador-test';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({
      userId: 'user-1',
      merchantId,
      username,
      roles: ['OPERATOR'],
    });
  });

  describe('POST /api/sales', () => {
    it('deve retornar 401 se usuário não estiver autenticado', async () => {
      mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({ items: [], payments: [] }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.message).toBe('Não autorizado.');
    });

    it('deve retornar 400 se o corpo da requisição for inválido (sem itens)', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({ items: [], payments: [] }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toBe('Dados de requisição de venda inválidos.');
    });

    it('deve retornar 201 com dados da venda quando executado com sucesso', async () => {
      const createdSale = Sale.create(merchantId, 'cash-session-1', username, { id: 'sale-uuid-1' });
      createdSale.addItem(SaleItem.create('prod-1', 'Arroz', Money.fromDecimal('20.00'), 1));
      createdSale.confirmPayments([
        Payment.create('CASH', Money.fromDecimal('20.00'), { receivedAmount: Money.fromDecimal('30.00') }),
      ]);

      mockExecuteCreateSale.mockResolvedValue(createdSale);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'key-header-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'CASH', amount: '20.00', receivedAmount: '30.00' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.id).toBe('sale-uuid-1');
      expect(json.status).toBe('CONFIRMED');
      expect(json.total).toBe('20.00');
      expect(json.cashReceived).toBe('30.00');
      expect(json.changeAmount).toBe('10.00');
      expect(json.items).toHaveLength(1);
      expect(json.payments).toHaveLength(1);

      expect(mockExecuteCreateSale).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId,
          operatorId: username,
          idempotencyKey: 'key-header-123',
        })
      );
    });

    it('deve mapear DuplicateSaleRequestError para status 409', async () => {
      mockExecuteCreateSale.mockRejectedValue(new DuplicateSaleRequestError('key-123'));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'PIX', amount: '20.00' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(409);
    });

    it('deve mapear OpenCashSessionRequiredError para status 400', async () => {
      mockExecuteCreateSale.mockRejectedValue(new OpenCashSessionRequiredError());

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ productId: 'prod-1', quantity: 1 }],
          payments: [{ method: 'PIX', amount: '20.00' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('deve mapear ProductNotFoundError para status 404', async () => {
      mockExecuteCreateSale.mockRejectedValue(new ProductNotFoundError('prod-999'));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ productId: 'prod-999', quantity: 1 }],
          payments: [{ method: 'PIX', amount: '20.00' }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/sales/[id]', () => {
    it('deve retornar 401 se usuário não estiver autenticado', async () => {
      mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

      const request = new NextRequest('http://localhost:3000/api/sales/sale-1');
      const response = await GET(request, { params: Promise.resolve({ id: 'sale-1' }) });

      expect(response.status).toBe(401);
    });

    it('deve retornar 404 se a venda não for encontrada', async () => {
      mockExecuteGetSaleById.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/sales/sale-inexistente');
      const response = await GET(request, { params: Promise.resolve({ id: 'sale-inexistente' }) });

      expect(response.status).toBe(404);
    });

    it('deve retornar 200 com os dados detalhados da venda', async () => {
      const sale = Sale.create(merchantId, 'cash-session-1', username, { id: 'sale-found-1' });
      sale.addItem(SaleItem.create('prod-1', 'Arroz', Money.fromDecimal('20.00'), 1));
      sale.confirmPayments([
        Payment.create('CASH', Money.fromDecimal('20.00'), { receivedAmount: Money.fromDecimal('25.00') }),
      ]);
      mockExecuteGetSaleById.mockResolvedValue(sale);

      const request = new NextRequest('http://localhost:3000/api/sales/sale-found-1');
      const response = await GET(request, { params: Promise.resolve({ id: 'sale-found-1' }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.id).toBe('sale-found-1');
      expect(json.status).toBe('CONFIRMED');
      expect(json.total).toBe('20.00');
      expect(json.changeAmount).toBe('5.00');
      expect(json.items).toHaveLength(1);
      expect(json.payments).toHaveLength(1);
    });
  });
});
