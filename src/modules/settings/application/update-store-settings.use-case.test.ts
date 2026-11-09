import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { DEFAULT_STORE_SETTINGS, type StoreSettings, type StoreSettingsRepository } from '../domain/store-settings.port';
import { UpdateStoreSettingsUseCase } from './update-store-settings.use-case';

class FakeSettingsRepository implements StoreSettingsRepository {
  public shops = new Map<string, StoreSettings>();
  public writes = 0;

  async get(merchantId: string): Promise<StoreSettings> {
    return this.shops.get(merchantId) ?? DEFAULT_STORE_SETTINGS;
  }

  async setStockControlEnabled(merchantId: string, enabled: boolean): Promise<void> {
    this.writes += 1;
    this.shops.set(merchantId, { stockControlEnabled: enabled });
  }
}

class FakeAudit implements AuditPort {
  public records: Array<{ merchantId: string; eventType: string; actorId: string; aggregateType: string; aggregateId: string; details: Record<string, unknown> }> = [];

  async record(merchantId: string, eventType: string, actorId: string, aggregateType: string, aggregateId: string, details: Record<string, unknown>): Promise<void> {
    this.records.push({ merchantId, eventType, actorId, aggregateType, aggregateId, details });
  }
}

describe('UpdateStoreSettingsUseCase', () => {
  let repository: FakeSettingsRepository;
  let audit: FakeAudit;
  let useCase: UpdateStoreSettingsUseCase;

  beforeEach(() => {
    repository = new FakeSettingsRepository();
    audit = new FakeAudit();
    useCase = new UpdateStoreSettingsUseCase(repository, audit);
  });

  it('a shop that was never configured controls its stock, as every shop did before', async () => {
    expect(await repository.get('loja-a')).toEqual({ stockControlEnabled: true });
  });

  it('turns the stock control off and records who did it, from what to what', async () => {
    const result = await useCase.execute('loja-a', 'dona', { stockControlEnabled: false });

    expect(result).toEqual({ stockControlEnabled: false });
    expect(await repository.get('loja-a')).toEqual({ stockControlEnabled: false });
    expect(audit.records).toEqual([
      {
        merchantId: 'loja-a',
        eventType: 'STORE_SETTINGS_CHANGED',
        actorId: 'dona',
        aggregateType: 'MERCHANT',
        aggregateId: 'loja-a',
        details: { setting: 'stockControlEnabled', from: true, to: false },
      },
    ]);
  });

  it('turns it back on, with its own record', async () => {
    await useCase.execute('loja-a', 'dona', { stockControlEnabled: false });
    await useCase.execute('loja-a', 'dona', { stockControlEnabled: true });

    expect(await repository.get('loja-a')).toEqual({ stockControlEnabled: true });
    expect(audit.records.map((r) => r.details)).toEqual([
      { setting: 'stockControlEnabled', from: true, to: false },
      { setting: 'stockControlEnabled', from: false, to: true },
    ]);
  });

  it('writes nothing, and records nothing, when nothing changes', async () => {
    const result = await useCase.execute('loja-a', 'dona', { stockControlEnabled: true });

    expect(result).toEqual({ stockControlEnabled: true });
    expect(repository.writes).toBe(0);
    expect(audit.records).toEqual([]);
  });

  it('changes only the shop it was called for', async () => {
    await useCase.execute('loja-a', 'dona', { stockControlEnabled: false });

    expect(await repository.get('loja-b')).toEqual({ stockControlEnabled: true });
  });
});

describe('the store settings API', () => {
  const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'store', 'settings', 'route.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('lets anyone signed in read, but only the owner change', () => {
    expect(route).toContain('export async function GET()');
    expect(route).toContain('export async function PATCH(request: NextRequest)');
    expect(route).toContain('isSessionOwner(session)');
    expect(route).toContain('status: 403');
    // The owner check comes before anything is changed.
    expect(route.indexOf('isSessionOwner(session)')).toBeLessThan(route.indexOf('useCase.execute('));
  });

  it('works on the shop of the session, never on one named in the request, and is never cached', () => {
    expect(route).toContain('session.merchantId');
    expect(route).not.toMatch(/searchParams|merchantId:\s*body/);
    expect(route).toContain("'Cache-Control': 'no-store'");
  });

  it('refuses a body that is not a yes or no, with 400', () => {
    expect(route).toContain('z.boolean(');
    expect(route).toContain('status: 400');
  });
});
