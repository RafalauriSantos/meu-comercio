import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { Money } from '@/shared/domain/money';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  NoOpenCashSessionError,
} from '@/modules/cash/application/record-cash-deposit.use-case';

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

const mockExecuteDeposit = vi.fn();
vi.mock('@/modules/cash/application/record-cash-deposit.use-case', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/cash/application/record-cash-deposit.use-case')>();
  return {
    ...actual,
    RecordCashDepositUseCase: class MockRecordCashDepositUseCase {
      execute = mockExecuteDeposit;
    },
  };
});

describe('POST /api/cash/deposit', () => {
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

    const request = new NextRequest('http://localhost:3000/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: '30.00', reason: 'Aporte de troco' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe('Não autorizado.');
  });

  it('deve retornar 400 se o valor for zero ou negativo', async () => {
    const request = new NextRequest('http://localhost:3000/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: '0', reason: 'Aporte nulo' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 400 se o motivo tiver menos de 3 caracteres', async () => {
    const request = new NextRequest('http://localhost:3000/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: '30.00', reason: 'x' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('inválidos');
  });

  it('deve retornar 400 se não houver caixa aberto', async () => {
    mockExecuteDeposit.mockRejectedValue(new NoOpenCashSessionError());

    const request = new NextRequest('http://localhost:3000/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: '30.00', reason: 'Aporte de troco' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.message).toContain('Não há sessão de caixa aberta');
  });

  it('deve registrar o suprimento com sucesso e retornar 200', async () => {
    mockExecuteDeposit.mockResolvedValue({
      sessionId: 'session-456',
      movementType: 'DEPOSIT',
      amount: Money.fromDecimal('30.00'),
      expectedCash: Money.fromDecimal('130.00'),
      reason: 'Aporte de moedas',
    });

    const request = new NextRequest('http://localhost:3000/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: '30.00', reason: 'Aporte de moedas' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.sessionId).toBe('session-456');
    expect(data.movementType).toBe('DEPOSIT');
    expect(data.amount).toBe('30.00');
    expect(data.expectedCash).toBe('130.00');
    expect(data.reason).toBe('Aporte de moedas');
    expect(mockExecuteDeposit).toHaveBeenCalledWith({
      merchantId,
      operatorId: username,
      amount: expect.any(Object),
      reason: 'Aporte de moedas',
    });
  });
});
