import { useEffect, useState } from 'react';
import { apiClient, ApiError, type AuthUser } from '@/frontend/lib/api-client';
import {
  clearSessionExpired,
  isSessionExpired,
  subscribeSessionExpired,
} from '@/frontend/lib/session-expired';
import { isSameSession } from './same-session';
import { loginUrlWithReturn } from './safe-return-path';

/**
 * State of the "your session expired" notice. The login opens in another tab, so this screen, the
 * cart and the drafts stay as they are; "Já entrei" checks who is logged in now.
 * `onResume` runs when it is the same person (the PDV uses it to sync the offline queue).
 */
export function useSessionExpired(user: AuthUser | null, onResume?: () => void) {
  const [expired, setExpired] = useState(isSessionExpired());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeSessionExpired(() => setExpired(isSessionExpired())), []);

  function reenter() {
    window.open(loginUrlWithReturn(window.location.pathname, window.location.search), '_blank', 'noopener');
  }

  async function confirmLogin() {
    setChecking(true);
    setError('');
    try {
      const fresh = await apiClient.me();
      if (isSameSession(user, fresh)) {
        clearSessionExpired();
        onResume?.();
      } else {
        // Another person or another store: nothing on this screen belongs to them.
        window.location.reload();
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Ainda não encontramos o seu login. Entre na outra aba e tente de novo.'
          : 'Não foi possível confirmar agora. Verifique a conexão e tente de novo.'
      );
    } finally {
      setChecking(false);
    }
  }

  return { expired, checking, error, reenter, confirmLogin };
}
