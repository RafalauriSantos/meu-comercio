import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { Money } from '@/shared/domain/money';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

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

const mockExecuteGetCreditMetrics = vi.fn();
vi.mock('@/modules/customers/application/get-credit-metrics.use-case', () => ({
  GetCreditMetricsUseCase: class MockGetCreditMetricsUseCase {
    execute = mockExecuteGetCreditMetrics;
  },
}));

describe('GET /api/customers/metrics', () => {
  const merchantId = 'merchant-test-123';
  const username = 'dona-maria';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthenticatedSession.mockResolvedValue({
      userId: 'user-owner',
      merchantId,
      username,
      roles: ['OWNER'],
    });
  });

  it('deve retornar 401 se usuário não estiver autenticado', async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(new UnauthorizedError());

    const response = await GET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toBe('Não autorizado.');
  });

  it('deve retornar 200 com os indicadores consolidados de fiado na rua', async () => {
    mockExecuteGetCreditMetrics.mockResolvedValue({
      totalOutstandingCredit: Money.fromDecimal('1250.75'),
      totalSettledCredit: Money.fromDecimal('4500.00'),
      activeDebtorsCount: 14,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.totalOutstandingCredit).toBe('1250.75');
    expect(data.totalSettledCredit).toBe('4500.00');
    expect(data.activeDebtorsCount).toBe(14);
    expect(mockExecuteGetCreditMetrics).toHaveBeenCalledWith({
      merchantId,
    });
  });
});
