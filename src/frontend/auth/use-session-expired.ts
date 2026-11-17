import { useEffect, useRef, useState } from 'react';
import { isSessionExpired, subscribeSessionExpired } from '@/frontend/lib/session-expired';
import { loginUrlHere } from './safe-return-path';
import { SESSION_REDIRECT_DELAY_MS, createOnce } from './session-redirect';

/**
 * State of the "your session expired" notice. The notice warns and, after a few seconds or on "Entrar agora",
 * takes the person to the login in this same tab (`?voltar=` brings them back to this page afterwards).
 * `beforeLeave` runs once, right before leaving, to keep what would be lost (the PDV saves the cart).
 */
export function useSessionExpired(beforeLeave?: () => void) {
  const [expired, setExpired] = useState(isSessionExpired());
  const latest = useRef(beforeLeave);
  const leave = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = beforeLeave;
  });

  useEffect(() => subscribeSessionExpired(() => setExpired(isSessionExpired())), []);

  useEffect(() => {
    if (!expired) return;
    leave.current ??= createOnce(() => {
      try {
        latest.current?.();
      } catch {
        // Never block the way to the login.
      }
      window.location.assign(loginUrlHere());
    });
    const timer = setTimeout(leave.current, SESSION_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [expired]);

  function enterNow() {
    leave.current?.();
  }

  return { expired, enterNow };
}
