export interface OwnerPinAttemptState {
  failedCount: number;
  lockedUntil: Date | null;
}

export interface OwnerPinAttemptStore {
  getState(merchantId: string): Promise<OwnerPinAttemptState>;
  saveState(merchantId: string, state: OwnerPinAttemptState): Promise<void>;
}
