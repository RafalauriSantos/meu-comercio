import type { AuthUser } from '@/frontend/lib/api-client';

/** The same person in the same store: the screen can go on as it was. */
export function isSameSession(
  current: Pick<AuthUser, 'username' | 'merchantId'> | null,
  fresh: Pick<AuthUser, 'username' | 'merchantId'>
): boolean {
  return current !== null && current.username === fresh.username && current.merchantId === fresh.merchantId;
}
