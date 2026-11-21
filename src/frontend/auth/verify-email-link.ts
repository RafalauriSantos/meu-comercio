import { ApiError, loadErrorMessage } from '@/frontend/lib/api-client';

export const INVALID_LINK_MESSAGE = 'Link inválido ou vencido. Peça um novo.';

/** The code of the link is in the URL fragment (`#token=...`), which the browser never sends to the server. */
export function readTokenFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('token') || null;
}

export type LinkFailure =
  | { name: 'invalid' } // any refused link looks the same (AC-22, AC-35)
  | { name: 'in-use' } // AC-5
  | { name: 'limited'; message: string } // AC-41: the IP limit, never shown as an invalid link
  | { name: 'failed'; message: string }; // no answer or a server error: the person may try again

export function describeLinkFailure(err: unknown): LinkFailure {
  if (err instanceof ApiError) {
    if (err.status === 400) return { name: 'invalid' };
    if (err.status === 409) return { name: 'in-use' };
    if (err.status === 429) return { name: 'limited', message: err.message };
  }
  return { name: 'failed', message: loadErrorMessage(err) };
}
