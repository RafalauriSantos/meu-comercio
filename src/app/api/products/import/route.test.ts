import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

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

const mockGetSettings = vi.fn();
vi.mock('@/modules/settings/infrastructure/drizzle-store-settings-repository', () => ({
  DrizzleStoreSettingsRepository: class MockSettingsRepository {
    get = mockGetSettings;
  },
}));

vi.mock('@/modules/products/infrastructure/drizzle-product-import-store', () => ({
  DrizzleProductImportStore: class MockImportStore {},
}));

const mockExecute = vi.fn();
vi.mock('@/modules/products/application/import-products.use-case', () => ({
  ImportProductsUseCase: class MockImportProductsUseCase {
    execute = mockExecute;
  },
}));

const owner = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/products/import', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const report = (errors: Array<{ line: number; message: string }> = [], imported = false) => ({
  valid: [],
  corrected: [],
  unchanged: [],
  skipped: [],
  errors,
  imported,
});

describe('POST /api/products/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthSession.mockResolvedValue(owner);
    mockGetSettings.mockResolvedValue({ stockControlEnabled: true });
    mockExecute.mockResolvedValue(report());
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await post({ csv: 'a' });

    expect(response.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns 403 to an operator, and reads and writes nothing', async () => {
    mockRequireAuthSession.mockResolvedValue({ ...owner, username: 'caixa', authorities: ['ROLE_OPERATOR'] });

    const response = await post({ csv: 'a', dryRun: false });

    expect(response.status).toBe(403);
    expect(mockGetSettings).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns 400 when onlyNames is not a boolean', async () => {
    const response = await post({ csv: 'a', onlyNames: 'sim' });

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns 400 without the sheet content', async () => {
    expect((await post({ dryRun: true })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
  });

  it('returns 413 above the size limit', async () => {
    const response = await post({ csv: 'x'.repeat(600_001) });

    expect(response.status).toBe(413);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('takes the shop and the actor from the session, never from the body, and passes the options', async () => {
    const response = await post({ csv: 'a;b', dryRun: false, onlyNames: true, merchantId: 'other-shop' });

    expect(response.status).toBe(200);
    expect(mockGetSettings).toHaveBeenCalledWith('merchant-1');
    expect(mockExecute).toHaveBeenCalledWith('merchant-1', 'dona', 'a;b', {
      dryRun: false,
      stockControl: true,
      onlyNames: true,
    });
  });

  it('is a preview unless dryRun is false, with onlyNames off by default', async () => {
    await post({ csv: 'a;b' });

    expect(mockExecute).toHaveBeenCalledWith('merchant-1', 'dona', 'a;b', expect.objectContaining({ dryRun: true, onlyNames: undefined }));
  });

  it('returns 422 with the report when a confirmation has errors, and 200 for the same errors in a preview', async () => {
    mockExecute.mockResolvedValue(report([{ line: 2, message: 'Preço inválido' }]));

    const confirmed = await post({ csv: 'a', dryRun: false });
    const preview = await post({ csv: 'a', dryRun: true });

    expect(confirmed.status).toBe(422);
    expect(await confirmed.json()).toMatchObject({
      message: 'A planilha tem linhas com problema. Nada foi importado.',
      errors: [{ line: 2, message: 'Preço inválido' }],
      imported: false,
    });
    expect(preview.status).toBe(200);
  });

  it('returns the five groups on a confirmation', async () => {
    mockExecute.mockResolvedValue(report([], true));

    const body = await (await post({ csv: 'a', dryRun: false })).json();

    expect(Object.keys(body).sort()).toEqual(['corrected', 'errors', 'imported', 'skipped', 'unchanged', 'valid']);
    expect(body.imported).toBe(true);
  });
});
