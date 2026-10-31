import { cookies } from 'next/headers';
import { getSessionCookieName, verifySessionToken, SessionData } from './session';

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
  return session;
}

export const requireAuthenticatedSession = requireAuthSession;

export async function setSessionCookie(
  sessionToken: string,
  maxAgeSeconds = 30 * 60
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
  cookieStore.delete(getSessionCookieName());
}

export class UnauthorizedError extends Error {
  constructor(message = 'Não autorizado. Faça login para continuar.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
