import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { Money } from '@/shared/domain/money';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => Promise.resolve(),
}));

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthSession: () => mockRequireAuthSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('@/shared/infrastructure/db/connection', () => ({ db: {} }));

const mockGetSummary = vi.fn();
vi.mock('@/modules/products/infrastructure/drizzle-product-repository', () => ({
  DrizzleProductRepository: class {
    getSummary = mockGetSummary;
  },
}));

const mockGetSettings = vi.fn();
vi.mock('@/modules/settings/infrastructure/drizzle-store-settings-repository', () => ({
  DrizzleStoreSettingsRepository: class {
    get = mockGetSettings;
  },
}));

describe('GET /api/products/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'dona' });
    mockGetSettings.mockResolvedValue({ stockControlEnabled: true });
    mockGetSummary.mockResolvedValue({
      total: 130,
      lowStockCount: 12,
      outOfStockCount: 4,
      stockValue: Money.fromDecimal('1234.50'),
    });
  });

  it('returns 401 without a session and reads nothing', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it('takes the merchant from the session and returns the summary, value as a decimal string', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetSummary).toHaveBeenCalledWith('merchant-1');
    expect(await response.json()).toEqual({ total: 130, lowStockCount: 12, outOfStockCount: 4, stockValue: '1234.50' });
  });

  it('with stock control off, sends only the total (the screen shows only that)', async () => {
    mockGetSettings.mockResolvedValue({ stockControlEnabled: false });

    const response = await GET();

    expect(await response.json()).toEqual({ total: 130, lowStockCount: null, outOfStockCount: null, stockValue: null });
  });

  it('returns 500 with a generic message when the read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetSummary.mockRejectedValue(new Error('connection refused to db-host'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('db-host');
  });
});
