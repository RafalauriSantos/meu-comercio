/** Clears the store's PIN lock (ADR-013, owned by `customers`). Wired in recovery-services.ts. */
export interface OwnerPinLockReset {
  clear(merchantId: string): Promise<void>;
}
