import { isSessionExpiry } from './session-expired';

// Pure rules of the API client: what kind of failure it was, what to tell the person, whether it means
// "go to the login", and how long a call may wait. Only an expired session goes to the login.

export type ApiErrorKind = 'session-expired' | 'network' | 'timeout' | 'rate-limit' | 'server' | 'business';

export function classifyStatus(status: number, path: string): ApiErrorKind {
  if (isSessionExpiry(status, path)) return 'session-expired';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  return 'business';
}

export const goesToLogin = (kind: ApiErrorKind): boolean => kind === 'session-expired';

const MESSAGES: Record<ApiErrorKind, string> = {
  'session-expired': 'Sua sessão expirou. Entre de novo.',
  network: 'Sem conexão com a internet. Confira a conexão e tente de novo.',
  timeout: 'A conexão está lenta. Tente de novo.',
  'rate-limit': 'Muitas tentativas seguidas. Espere um instante e tente de novo.',
  server: 'O sistema teve um problema. Tente de novo em instantes.',
  business: 'Falha ao processar solicitação.',
};

/** What to show when the server sent no message of its own. */
export const fallbackMessage = (kind: ApiErrorKind): string => MESSAGES[kind];

export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 30_000;

// A sale and its cancel are never given up on by the client: aborting only stops the wait, the server may
// still save it, and the person would not know. The idempotency key makes a resend safe.
const SALE_WRITE = /^\/api\/sales(\/[^/]+\/cancel)?$/;

/** Milliseconds a call may wait, or null for no limit. */
export function timeoutFor(method: string, path: string): number | null {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD') return READ_TIMEOUT_MS;
  if (verb === 'POST' && SALE_WRITE.test(path.split('?')[0])) return null;
  return WRITE_TIMEOUT_MS;
}
