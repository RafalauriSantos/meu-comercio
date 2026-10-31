import { cookies } from 'next/headers';
import { getSessionCookieName, verifySessionToken, SessionData } from './session';

export async function getCurrentSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export async function requireAuthSession(): Promise<SessionData> {
  const session = await getCurrentSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Não autorizado. Faça login para continuar.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
