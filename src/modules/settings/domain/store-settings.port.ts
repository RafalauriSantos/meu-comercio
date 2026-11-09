// The settings of a shop that the owner can change. Today there is one: whether the shop controls its stock.

export interface StoreSettings {
  /**
   * On: a sale needs stock and takes the items out of it, and the stock screens show. Off: a sale needs no
   * stock and takes nothing out. A shop that was never configured has it on, as every shop did before.
   */
  stockControlEnabled: boolean;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = { stockControlEnabled: true };

/** What the sale needs to know. */
export interface StoreSettingsReader {
  get(merchantId: string): Promise<StoreSettings>;
}

export interface StoreSettingsRepository extends StoreSettingsReader {
  setStockControlEnabled(merchantId: string, enabled: boolean): Promise<void>;
}
