import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { ExportTooLargeError, NoProductsToExportError } from '@/modules/products/domain/product-errors';

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

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => Promise.resolve(),
}));

vi.mock('@/shared/infrastructure/db/connection', () => ({ db: {} }));

const mockGetSettings = vi.fn();
vi.mock('@/modules/settings/infrastructure/drizzle-store-settings-repository', () => ({
  DrizzleStoreSettingsRepository: class MockSettingsRepository {
    get = mockGetSettings;
  },
}));

vi.mock('@/modules/products/infrastructure/drizzle-product-export-reader', () => ({
  DrizzleProductExportReader: class MockReader {},
}));

const mockExecute = vi.fn();
vi.mock('@/modules/products/application/export-products.use-case', () => ({
  ExportProductsUseCase: class MockExportProductsUseCase {
    execute = mockExecute;
  },
}));

const owner = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };

describe('GET /api/products/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthSession.mockResolvedValue(owner);
    mockGetSettings.mockResolvedValue({ stockControlEnabled: true });
    mockExecute.mockResolvedValue({ csv: '﻿a;b\r\n', filename: 'produtos-2026-11-19.csv' });
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns 403 to an operator, and reads nothing', async () => {
    mockRequireAuthSession.mockResolvedValue({ ...owner, username: 'caixa', authorities: ['ROLE_OPERATOR'] });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockGetSettings).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns the CSV as a download, for the shop of the session', async () => {
    mockGetSettings.mockResolvedValue({ stockControlEnabled: false });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="produtos-2026-11-19.csv"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    // Bytes, because text() drops the BOM.
    expect(Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(mockGetSettings).toHaveBeenCalledWith('merchant-1');
    expect(mockExecute).toHaveBeenCalledWith('merchant-1', { stockControl: false });
  });

  it('returns 422 with a message when there is nothing to export', async () => {
    mockExecute.mockRejectedValue(new NoProductsToExportError());

    const response = await GET();

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ message: 'Não há produtos para exportar.' });
  });

  it('returns 422 with the count when the catalog is too large', async () => {
    mockExecute.mockRejectedValue(new ExportTooLargeError(1234, 1000));

    const response = await GET();

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ message: 'A planilha exporta até 1.000 produtos e a loja tem 1.234. Fale com o suporte.' });
  });

  it('returns 500 without internal details on an unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExecute.mockRejectedValue(new Error('connection refused to db.internal'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Erro interno ao exportar produtos.' });
  });
});
