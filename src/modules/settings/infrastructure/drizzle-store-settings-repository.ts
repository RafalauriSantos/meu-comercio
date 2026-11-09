import { eq } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { DEFAULT_STORE_SETTINGS, type StoreSettings, type StoreSettingsRepository } from '../domain/store-settings.port';

export type StoreSettingsDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

export class DrizzleStoreSettingsRepository<TSchema extends Record<string, unknown>> implements StoreSettingsRepository {
  constructor(private readonly database: StoreSettingsDatabase<TSchema>) {}

  async get(merchantId: string): Promise<StoreSettings> {
    const [row] = await this.database
      .select({ stockControlEnabled: merchants.stockControlEnabled })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);
    return row ? { stockControlEnabled: row.stockControlEnabled } : DEFAULT_STORE_SETTINGS;
  }

  async setStockControlEnabled(merchantId: string, enabled: boolean): Promise<void> {
    await this.database.update(merchants).set({ stockControlEnabled: enabled }).where(eq(merchants.id, merchantId));
  }
}
