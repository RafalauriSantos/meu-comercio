import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailInUseError } from '../domain/errors';
import { PasswordResetRepository } from '../domain/password-reset-repository.port';
import { OwnerEmailRecord, OwnerEmailRepository } from '../domain/owner-email-repository.port';
import { RecoveryDecision } from '../domain/recovery-limits';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { IssueRecoveryTokenParams, RecoveryTokenRecord, RecoveryTokenRepository } from '../domain/recovery-token-repository.port';

/** Limiter whose answer the test chooses. */
export class StubRecoveryLimiter implements RecoveryRequestLimiter {
  decision: RecoveryDecision = { status: 'ALLOWED' };
  tokenDecision: RecoveryDecision = { status: 'ALLOWED' };
  reserved: Array<{ accountKey: string; ipKey: string; targetKey: string; enforceResend?: boolean }> = [];
  tokenAttempts: string[] = [];

  async reserve(keys: { accountKey: string; ipKey: string; targetKey: string; enforceResend?: boolean }): Promise<RecoveryDecision> {
    this.reserved.push(keys);
    return this.decision;
  }

  async reserveTokenAttempt(ipKey: string): Promise<RecoveryDecision> {
    this.tokenAttempts.push(ipKey);
    return this.tokenDecision;
  }
}

export class RecordingAudit implements AuditPort {
  readonly events: Array<{
    merchantId: string;
    eventType: string;
    actorId: string;
    aggregateType: string;
    aggregateId: string;
    details: Record<string, unknown>;
  }> = [];

  async record(
    merchantId: string,
    eventType: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    details: Record<string, unknown>
  ) {
    this.events.push({ merchantId, eventType, actorId, aggregateType, aggregateId, details });
  }
}

interface StoredToken extends RecoveryTokenRecord {
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/** Accounts and links in memory, behaving like the Drizzle adapters. */
export class InMemoryRecoveryStore implements OwnerEmailRepository, RecoveryTokenRepository {
  readonly users = new Map<string, OwnerEmailRecord>();
  readonly tokens: StoredToken[] = [];

  addUser(username: string, record: Partial<OwnerEmailRecord> = {}): void {
    this.users.set(username, { merchantId: 'merchant-1', email: null, verifiedAt: null, ...record });
  }

  async getEmail(username: string) {
    return this.users.get(username) ?? null;
  }

  async isVerifiedByAnother(email: string, username: string) {
    return [...this.users].some(([name, u]) => name !== username && u.email === email && u.verifiedAt !== null);
  }

  async setUnverifiedEmail(username: string, email: string) {
    this.users.set(username, { ...this.users.get(username)!, email, verifiedAt: null });
  }

  async changeEmail(username: string, email: string) {
    const current = this.users.get(username)!;
    this.users.set(username, { ...current, email, verifiedAt: null });
    return { previousEmail: current.email, previousVerified: current.verifiedAt !== null };
  }

  async confirmVerification(tokenHash: string, now: Date) {
    const token = this.tokens.find(
      (t) => t.tokenHash === tokenHash && t.purpose === 'EMAIL_VERIFICATION' && !t.usedAt && t.expiresAt > now
    );
    if (!token) return null;
    const user = this.users.get(token.username);
    if (!user || user.email !== token.email) return null;
    if (await this.isVerifiedByAnother(token.email, token.username)) throw new EmailInUseError();
    token.usedAt = now;
    this.users.set(token.username, { ...user, verifiedAt: now });
    return { merchantId: token.merchantId, username: token.username, email: token.email };
  }

  async issue(params: IssueRecoveryTokenParams) {
    for (const t of this.tokens) {
      if (t.username === params.username && t.purpose === params.purpose && !t.usedAt && t.expiresAt > params.now) {
        t.expiresAt = params.now;
      }
    }
    this.tokens.push({ ...params, usedAt: null });
  }

  async find(tokenHash: string, now: Date) {
    const t = this.tokens.find((x) => x.tokenHash === tokenHash && !x.usedAt && x.expiresAt > now);
    return t ? { merchantId: t.merchantId, username: t.username, purpose: t.purpose, email: t.email } : null;
  }

  async invalidate(tokenHash: string, now: Date) {
    for (const t of this.tokens) if (t.tokenHash === tokenHash && !t.usedAt) t.expiresAt = now;
  }
}

interface StoredAccount {
  passwordHash: string;
  authorizationPinHash: string | null;
  isOwner: boolean;
  enabled: boolean;
  merchantName: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  credentialsChangedAt: Date | null;
}

/** Recovery store plus the password reset queries, with the same rules as DrizzlePasswordResetRepository. */
export class InMemoryPasswordResetStore extends InMemoryRecoveryStore implements PasswordResetRepository {
  readonly accounts = new Map<string, StoredAccount>();

  addAccount(username: string, user: Partial<OwnerEmailRecord> = {}, account: Partial<StoredAccount> = {}): void {
    this.addUser(username, user);
    this.accounts.set(username, {
      passwordHash: 'old-hash', authorizationPinHash: null, isOwner: true, enabled: true, merchantName: 'Loja da Maria',
      failedLoginAttempts: 0, lockedUntil: null, credentialsChangedAt: null, ...account,
    });
  }

  async findOwnerByVerifiedEmail(email: string) {
    for (const [username, user] of this.users) {
      const account = this.accounts.get(username);
      if (account?.isOwner && account.enabled && user.verifiedAt && user.email === email) {
        return { merchantId: user.merchantId, username, merchantName: account.merchantName };
      }
    }
    return null;
  }

  async getCredentials(username: string) {
    const account = this.accounts.get(username);
    const user = this.users.get(username);
    return account?.isOwner && account.enabled && user ? { passwordHash: account.passwordHash, email: user.email, verifiedAt: user.verifiedAt } : null;
  }

  async resetPassword({ tokenHash, passwordHash, now }: { tokenHash: string; passwordHash: string; now: Date }) {
    return this.useLinkAndUpdate('PASSWORD_RESET', tokenHash, now, { passwordHash });
  }

  async resetPasswordAndPin({ tokenHash, passwordHash, pinHash, now }: { tokenHash: string; passwordHash: string; pinHash: string; now: Date }) {
    return this.useLinkAndUpdate('PIN_RESET', tokenHash, now, { passwordHash, authorizationPinHash: pinHash });
  }

  private async useLinkAndUpdate(
    purpose: 'PASSWORD_RESET' | 'PIN_RESET',
    tokenHash: string,
    now: Date,
    values: { passwordHash: string; authorizationPinHash?: string }
  ) {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash && t.purpose === purpose && !t.usedAt && t.expiresAt > now);
    if (!token) return null;
    token.usedAt = now;
    const user = this.users.get(token.username);
    const account = this.accounts.get(token.username);
    if (!user || !account?.isOwner || !account.enabled || !user.verifiedAt || user.email !== token.email) return null;
    Object.assign(account, { ...values, credentialsChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null });
    return { merchantId: token.merchantId, username: token.username, email: token.email };
  }
}
