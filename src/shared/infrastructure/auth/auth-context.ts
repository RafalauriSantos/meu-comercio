import { cookies } from 'next/headers';
import {
  getSessionCookieName,
  verifySessionToken,
  renewSessionToken,
  INACTIVITY_MINUTES,
  SessionData,
} from './session';

export async function getCurrentSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  return token ? verifySessionToken(token) : null;
}

export async function requireAuthSession(): Promise<SessionData> {
  const session = await getCurrentSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  const renewed = renewSessionToken(session);
  if (renewed) {
    try {
      await setSessionCookie(renewed.token, renewed.maxAgeSeconds);
    } catch {
      // Cookies can only be written in a Route Handler or Server Function. The session is still valid, so do not fail the request.
    }
  }
  return session;
}

export const requireAuthenticatedSession = requireAuthSession;

export async function setSessionCookie(
  sessionToken: string,
  maxAgeSeconds = INACTIVITY_MINUTES * 60
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  // In production the cookie is named "__Host-...", and a browser ignores any Set-Cookie for such a name that
  // is not Secure, an expiry included. cookieStore.delete() sends it without Secure, so the cookie stayed and
  // the person was still signed in after "Sair". Expiring it with the same attributes it was set with works.
  cookieStore.set(getSessionCookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export class UnauthorizedError extends Error {
  constructor(message = 'Não autorizado. Faça login para continuar.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
