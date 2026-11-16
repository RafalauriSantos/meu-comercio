import crypto from 'crypto';
import { UserAuthority } from '@/modules/users/domain/user';

export interface SessionData {
  username: string;
  merchantId: string;
  authorities: UserAuthority[];
  expiresAt: number; // Unix timestamp in milliseconds
  startedAt?: number; // login time in milliseconds; absent in tokens issued before the sliding session
}

export function isSessionOwner(session: SessionData): boolean {
  return session.authorities.includes('ROLE_OWNER');
}

export function hasSessionAuthority(session: SessionData, authority: UserAuthority): boolean {
  return isSessionOwner(session) || session.authorities.includes(authority);
}

// DECISIONS.md D-09 and D-16: expires after 2 h without use, never beyond 12 h since login.
export const INACTIVITY_MINUTES = 120;
export const ABSOLUTE_MAX_HOURS = 12;
const INACTIVITY_MS = INACTIVITY_MINUTES * 60 * 1000;
const ABSOLUTE_MAX_MS = ABSOLUTE_MAX_HOURS * 60 * 60 * 1000;
// Renew only when more than half of the inactivity window has passed, to avoid rewriting the cookie on every request.
const RENEW_BELOW_MS = INACTIVITY_MS / 2;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be defined with at least 32 characters in production.');
    }
    return 'development-session-secret-must-be-at-least-32-chars-long';
  }
  return secret;
}

export function getSessionCookieName(): string {
  return process.env.NODE_ENV === 'production'
    ? '__Host-MEU_COMERCIO_SESSION'
    : 'MEU_COMERCIO_SESSION';
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signSession(session: SessionData): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${signPayload(payload, getSessionSecret())}`;
}

export function createSessionToken(
  data: Omit<SessionData, 'expiresAt' | 'startedAt'>,
  timeoutMinutes = INACTIVITY_MINUTES
): string {
  const now = Date.now();
  return signSession({ ...data, startedAt: now, expiresAt: now + timeoutMinutes * 60 * 1000 });
}

/**
 * Sliding renewal: returns a new token (and its cookie maxAge) when more than half of the inactivity window
 * has passed, or null when there is nothing to renew. The new expiry never goes past startedAt + 12 h.
 * Tokens without startedAt are never renewed: they run until their own expiry.
 */
export function renewSessionToken(
  session: SessionData
): { token: string; maxAgeSeconds: number } | null {
  const now = Date.now();
  if (session.startedAt === undefined || session.expiresAt - now >= RENEW_BELOW_MS) {
    return null;
  }

  const expiresAt = Math.min(now + INACTIVITY_MS, session.startedAt + ABSOLUTE_MAX_MS);
  if (expiresAt <= session.expiresAt) {
    return null;
  }

  return {
    token: signSession({ ...session, expiresAt }),
    maxAgeSeconds: Math.floor((expiresAt - now) / 1000),
  };
}

export function verifySessionToken(token: string): SessionData | null {
  const [payload, signature] = token?.split('.') ?? [];
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload, getSessionSecret());
  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const session = JSON.parse(json) as SessionData;
    return Date.now() > session.expiresAt ? null : session;
  } catch {
    return null;
  }
}
