'use client';

import { useState } from 'react';
import { sanitizePin } from '@/frontend/auth/sanitize-pin';
import type { DeleteError } from '@/frontend/management/deactivate';

/** The state of the "Excluir" confirmation of one item: asking or not, the PIN typed (customers) and the last error. */
export function useDeleteConfirm() {
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<DeleteError | null>(null);

  function ask() {
    setPin('');
    setError(null);
    setAsking(true);
  }

  // Closing the window or the panel always drops the PIN.
  function reset() {
    setAsking(false);
    setPin('');
    setError(null);
  }

  return { asking, pin, error, setError, changePin: (value: string) => setPin(sanitizePin(value)), clearPin: () => setPin(''), ask, reset };
}
