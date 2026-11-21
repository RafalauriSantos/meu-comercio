import { RecoveryPurpose } from './recovery-token';

export interface RecoveryTokenRecord {
  merchantId: string;
  username: string;
  purpose: RecoveryPurpose;
  email: string;
}

export interface IssueRecoveryTokenParams extends RecoveryTokenRecord {
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface RecoveryTokenRepository {
  /** In one transaction: ends the unused links of the same user and purpose, then stores the new one. */
  issue(params: IssueRecoveryTokenParams): Promise<void>;
  /** Reads a link that is unused and not expired. Does not consume it. */
  find(tokenHash: string, now: Date): Promise<RecoveryTokenRecord | null>;
  /** Ends an unused link (the e-mail could not be sent). */
  invalidate(tokenHash: string, now: Date): Promise<void>;
}
