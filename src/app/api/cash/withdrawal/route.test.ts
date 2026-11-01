import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { Money } from '@/shared/domain/money';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  NoOpenCashSessionError,
  InsufficientCashForWithdrawalError,
} from '@/modules/cash/application/record-cash-withdrawal.use-case';

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

const mockExecuteWithdrawal = vi.fn();
vi.mock('@/modules/cash/application/record-cash-withdrawal.use-case', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/cash/application/record-cash-withdrawal.use-case')>();
  return {
    ...actual,
    RecordCashWithdrawalUseCase: class MockRecordCashWithdrawalUseCase {
      execute = mockExecuteWithdrawal;
    },
  };
});

describe('POST /api/cash/withdrawal', () => {
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

  it('deve retornar 401 se usuário não estiver autenticado', async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '50.00', reason: 'Retirada para cofre' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe('Não autorizado.');
  });

  it('deve retornar 400 se o valor for negativo ou zero', async () => {
    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '-10.00', reason: 'Retirada inválida' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 400 se o motivo tiver menos de 3 caracteres', async () => {
    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '50.00', reason: 'oi' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 400 se não houver caixa aberto', async () => {
    mockExecuteWithdrawal.mockRejectedValue(new NoOpenCashSessionError());

    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '50.00', reason: 'Sangria de caixa' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('Não há sessão de caixa aberta');
  });

  it('deve retornar 400 se não houver saldo suficiente na gaveta', async () => {
    mockExecuteWithdrawal.mockRejectedValue(
      new InsufficientCashForWithdrawalError('Saldo em dinheiro insuficiente.')
    );

    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '500.00', reason: 'Sangria acima do limite' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toBe('Saldo em dinheiro insuficiente.');
  });

  it('deve registrar a sangria com sucesso e retornar 200', async () => {
    mockExecuteWithdrawal.mockResolvedValue({
      sessionId: 'session-123',
      movementType: 'WITHDRAWAL',
      amount: Money.fromDecimal('50.00'),
      expectedCash: Money.fromDecimal('150.00'),
      reason: 'Recolhimento para cofre',
    });

    const request = new NextRequest('http://localhost:3000/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify({ amount: '50.00', reason: 'Recolhimento para cofre' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.sessionId).toBe('session-123');
    expect(data.movementType).toBe('WITHDRAWAL');
    expect(data.amount).toBe('50.00');
    expect(data.expectedCash).toBe('150.00');
    expect(data.reason).toBe('Recolhimento para cofre');
    expect(mockExecuteWithdrawal).toHaveBeenCalledWith({
      merchantId,
      operatorId: username,
      amount: expect.any(Object),
      reason: 'Recolhimento para cofre',
    });
  });
});
