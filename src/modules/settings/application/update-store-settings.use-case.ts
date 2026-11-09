import type { AuditPort } from '@/modules/audit/domain/audit.port';
import type { StoreSettings, StoreSettingsRepository } from '../domain/store-settings.port';

export interface UpdateStoreSettingsInput {
  stockControlEnabled: boolean;
}

/** Changes the settings of the shop, and writes who changed what in the audit trail. Nothing is written if nothing changed. */
export class UpdateStoreSettingsUseCase {
  constructor(
    private readonly repository: StoreSettingsRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(merchantId: string, actorId: string, input: UpdateStoreSettingsInput): Promise<StoreSettings> {
    const current = await this.repository.get(merchantId);

    if (current.stockControlEnabled !== input.stockControlEnabled) {
      await this.repository.setStockControlEnabled(merchantId, input.stockControlEnabled);
      await this.auditPort.record(merchantId, 'STORE_SETTINGS_CHANGED', actorId, 'MERCHANT', merchantId, {
        setting: 'stockControlEnabled',
        from: current.stockControlEnabled,
        to: input.stockControlEnabled,
      });
    }

    return { stockControlEnabled: input.stockControlEnabled };
  }
}
