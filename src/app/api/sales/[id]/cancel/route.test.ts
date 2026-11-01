import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  SaleNotFoundError,
  SaleAlreadyCancelledError,
  InsufficientCashForRefundError,
} from '@/modules/sales/application/cancel-sale.use-case';
import { InvalidOwnerPinError } from '@/modules/customers/domain/errors';

const mockRequireAuthenticatedSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthenticatedSession: () => mockRequireAuthenticatedSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

const mockExecuteCancelSale = vi.fn();
vi.mock('@/modules/sales/application/cancel-sale.use-case', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/sales/application/cancel-sale.use-case')>();
  return {
    ...actual,
    CancelSaleUseCase: class MockCancelSaleUseCase {
      execute = mockExecuteCancelSale;
    },
  };
});

describe('POST /api/sales/[id]/cancel', () => {
  const merchantId = 'merchant-test-123';
  const username = 'operador-test';
  const saleId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({
      userId: 'user-1',
      merchantId,
      username,
      roles: ['OPERATOR'],
    });
  });

  it('deve retornar 401 se usuário não estiver autenticado', async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'Cliente desistiu' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe('Não autorizado.');
  });

  it('deve retornar 400 se o PIN da dona não tiver de 4 a 6 dígitos', async () => {
    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '12', reason: 'Motivo válido' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 400 se o motivo tiver menos de 3 caracteres', async () => {
    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'ab' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 403 se o PIN da dona for incorreto', async () => {
    mockExecuteCancelSale.mockRejectedValue(new InvalidOwnerPinError('PIN inválido.'));

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '9999', reason: 'Cliente desistiu' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.message).toBe('PIN inválido.');
  });

  it('deve retornar 404 se a venda não for encontrada', async () => {
    mockExecuteCancelSale.mockRejectedValue(new SaleNotFoundError(saleId));

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'Cliente desistiu' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.message).toContain('não encontrada');
  });

  it('deve retornar 400 se a venda já estiver cancelada', async () => {
    mockExecuteCancelSale.mockRejectedValue(new SaleAlreadyCancelledError());

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'Tentativa duplicada' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Venda já se encontra cancelada.');
  });

  it('deve retornar 400 se não houver dinheiro em caixa para estorno em espécie', async () => {
    mockExecuteCancelSale.mockRejectedValue(
      new InsufficientCashForRefundError('Dinheiro insuficiente na gaveta.')
    );

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'Devolução em dinheiro' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Dinheiro insuficiente na gaveta.');
  });

  it('deve cancelar a venda com sucesso e retornar 200', async () => {
    const mockSale = {
      toJSON: () => ({
        id: saleId,
        merchantId,
        status: 'CANCELLED',
        total: '45.00',
      }),
    };
    mockExecuteCancelSale.mockResolvedValue(mockSale);

    const request = new NextRequest(`http://localhost:3000/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ ownerPin: '1234', reason: 'Cliente desistiu da compra' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.sale.id).toBe(saleId);
    expect(data.sale.status).toBe('CANCELLED');
    expect(mockExecuteCancelSale).toHaveBeenCalledWith({
      merchantId,
      saleId,
      operatorId: username,
      ownerPin: '1234',
      reason: 'Cliente desistiu da compra',
    });
  });
});
