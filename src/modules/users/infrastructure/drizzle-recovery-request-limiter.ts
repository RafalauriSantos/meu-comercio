import { createHmac } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { accessRecoveryRequests } from './users.schema';
import { RecoveryDatabase } from './recovery-database';
import {
  decideRecoveryRequest,
  decideTokenAttempt,
  RECOVERY_WINDOW_MINUTES,
  RecoveryDecision,
} from '../domain/recovery-limits';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_MS = RECOVERY_WINDOW_MINUTES * 60 * 1000;

// Same rule as the session secret (session.ts): required in production, a fixed value only outside it.
function hmacSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be defined with at least 32 characters in production.');
  }
  return 'development-session-secret-must-be-at-least-32-chars-long';
}

type Scope = 'ACCOUNT' | 'IP' | 'GLOBAL_DAY' | 'IP_TOKEN' | 'TARGET_EMAIL';

/** The key is stored as an HMAC (D-32, AC-43): neither the account nor the IP can be read from a dump. */
function keyHash(scope: Scope, key: string): string {
  return createHmac('sha256', hmacSecret()).update(`${scope}:${key}`).digest('hex');
}

export class DrizzleRecoveryRequestLimiter<TSchema extends Record<string, unknown>> implements RecoveryRequestLimiter {
  constructor(private readonly database: RecoveryDatabase<TSchema>) {}

  /**
   * The rule lives in decideRecoveryRequest. There is no single row to lock (FOR UPDATE, as in ADR-013),
   * so a transaction-scoped advisory lock per key serializes count, decision and insert. The locks are taken in
   * a fixed order (scope names sort as ACCOUNT, GLOBAL_DAY, IP, TARGET_EMAIL), so two requests cannot deadlock.
   */
  async reserve(
    keys: { accountKey: string; ipKey: string; targetKey: string; enforceResend?: boolean },
    now: Date
  ): Promise<RecoveryDecision> {
    const account = keyHash('ACCOUNT', keys.accountKey);
    const ip = keyHash('IP', keys.ipKey);
    const day = keyHash('GLOBAL_DAY', 'app');
    const target = keyHash('TARGET_EMAIL', keys.targetKey);

    // Rows older than 24 h are of no use to any limit. Deleted before the locks, in its own statement, so no
    // advisory lock is held while rows are locked by the DELETE (a rare deadlock between two requests).
    await this.database.delete(accessRecoveryRequests).where(lt(accessRecoveryRequests.createdAt, new Date(now.getTime() - DAY_MS)));

    return this.database.transaction(async (tx) => {
      for (const [scope, hash] of [['ACCOUNT', account], ['GLOBAL_DAY', day], ['IP', ip], ['TARGET_EMAIL', target]] as const) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${scope}:${hash}`}))`);
      }

      const since = new Date(now.getTime() - WINDOW_MS);
      const times = async (scope: Scope, hash: string) =>
        (
          await tx
            .select({ createdAt: accessRecoveryRequests.createdAt })
            .from(accessRecoveryRequests)
            .where(and(eq(accessRecoveryRequests.scope, scope), eq(accessRecoveryRequests.keyHash, hash), gt(accessRecoveryRequests.createdAt, since)))
        ).map((r) => r.createdAt);
      const [{ dailyCount }] = await tx
        .select({ dailyCount: sql<number>`count(*)::int` })
        .from(accessRecoveryRequests)
        .where(and(eq(accessRecoveryRequests.scope, 'GLOBAL_DAY'), gt(accessRecoveryRequests.createdAt, new Date(now.getTime() - DAY_MS))));

      const decision = decideRecoveryRequest(
        { accountRequests: await times('ACCOUNT', account), ipRequests: await times('IP', ip), targetRequests: await times('TARGET_EMAIL', target), dailyCount },
        now,
        keys.enforceResend
      );
      if (decision.status === 'ALLOWED') {
        await tx.insert(accessRecoveryRequests).values([
          { scope: 'ACCOUNT', keyHash: account, createdAt: now },
          { scope: 'IP', keyHash: ip, createdAt: now },
          { scope: 'GLOBAL_DAY', keyHash: day, createdAt: now },
          { scope: 'TARGET_EMAIL', keyHash: target, createdAt: now },
        ]);
      }
      return decision;
    });
  }

  async reserveTokenAttempt(ipKey: string, now: Date): Promise<RecoveryDecision> {
    const ip = keyHash('IP_TOKEN', ipKey);

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`IP_TOKEN:${ip}`}))`);

      const rows = await tx
        .select({ createdAt: accessRecoveryRequests.createdAt })
        .from(accessRecoveryRequests)
        .where(
          and(
            eq(accessRecoveryRequests.scope, 'IP_TOKEN'),
            eq(accessRecoveryRequests.keyHash, ip),
            gt(accessRecoveryRequests.createdAt, new Date(now.getTime() - WINDOW_MS))
          )
        );

      const decision = decideTokenAttempt(rows.map((r) => r.createdAt), now);
      if (decision.status === 'ALLOWED') {
        await tx.insert(accessRecoveryRequests).values({ scope: 'IP_TOKEN', keyHash: ip, createdAt: now });
      }
      return decision;
    });
  }
}
