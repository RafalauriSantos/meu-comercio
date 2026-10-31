import crypto from 'crypto';
import { UserAuthority } from '@/modules/users/domain/user';

export interface SessionData {
  username: string;
  merchantId: string;
  authorities: UserAuthority[];
  expiresAt: number; // Unix timestamp in milliseconds
}

export function isSessionOwner(session: SessionData): boolean {
  return session.authorities.includes('ROLE_OWNER');
}

export function hasSessionAuthority(session: SessionData, authority: UserAuthority): boolean {
  return isSessionOwner(session) || session.authorities.includes(authority);
}

const DEFAULT_TIMEOUT_MINUTES = 30;

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

export function createSessionToken(
  data: Omit<SessionData, 'expiresAt'>,
  timeoutMinutes = DEFAULT_TIMEOUT_MINUTES
): string {
  const secret = getSessionSecret();
  const session: SessionData = {
    ...data,
    expiresAt: Date.now() + timeoutMinutes * 60 * 1000,
  };

  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${signPayload(payload, secret)}`;
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
