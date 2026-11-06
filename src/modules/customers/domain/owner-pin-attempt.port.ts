export interface OwnerPinAttemptState {
  failedCount: number;
  lockedUntil: Date | null;
}

export interface OwnerPinAttemptStore {
  /** Reserves one attempt atomically. Returns false when the merchant is locked. */
  tryReserveAttempt(merchantId: string, now: Date): Promise<boolean>;
  /** Clears the counter after a correct PIN. */
  reset(merchantId: string): Promise<void>;
  getState(merchantId: string): Promise<OwnerPinAttemptState>;
}
