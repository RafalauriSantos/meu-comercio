// One place that knows "the session expired": apiRequest tells it, the screens listen to it.
// No library: a flag and a list of listeners.

// A 401 here is a wrong password or a missing setup, not an expired session.
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register', '/api/setup/'];

/** Only a 401 on an authenticated route means the session expired. 403, 404, 429, 5xx and network errors never do. */
export function isSessionExpiry(status: number, path: string): boolean {
  return status === 401 && !PUBLIC_PATHS.some((p) => path.startsWith(p));
}

let expired = false;
const listeners = new Set<() => void>();

export function isSessionExpired(): boolean {
  return expired;
}

function setExpired(value: boolean): void {
  if (expired === value) return;
  expired = value;
  listeners.forEach((listener) => listener());
}

export const notifySessionExpired = () => setExpired(true);
export const clearSessionExpired = () => setExpired(false);

export function subscribeSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
