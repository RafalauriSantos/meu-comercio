'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiError } from '@/frontend/lib/api-client';
import { sanitizePin } from './sanitize-pin';
import { describeLinkFailure, readTokenFromHash, type LinkFailure } from './verify-email-link';

export type ResetPhase =
  | { name: 'reading' }
  | { name: 'ready'; error?: string }
  | { name: 'submitting' }
  | { name: 'done' }
  | Exclude<LinkFailure, { name: 'in-use' }>;

// This page has no "in use" case: a 409 is just a refused link.
const toPhase = (failure: LinkFailure): ResetPhase => (failure.name === 'in-use' ? { name: 'invalid' } : failure);

/**
 * State of the page that opens the password link. Opening only reads the link; the password changes on the
 * submit (a mail scanner that opens the link must not use it). The code is read from the URL fragment, the
 * fragment is cleared, and the code lives only in a ref and in the body of the two calls. With kind 'pin' the
 * same page also takes the new PIN, and the PIN never changes without the new password (AC-28).
 */
export function useResetPassword(kind: 'password' | 'pin' = 'password') {
  const token = useRef<string | null | undefined>(undefined); // undefined: the fragment was not read yet
  const [phase, setPhase] = useState<ResetPhase>({ name: 'reading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const inspect = useCallback(async () => {
    if (!token.current) return setPhase({ name: 'invalid' });
    setPhase({ name: 'reading' });
    try {
      await (kind === 'pin' ? apiClient.inspectPinReset(token.current) : apiClient.inspectPasswordReset(token.current));
      setPhase({ name: 'ready' });
    } catch (err) {
      setPhase(toPhase(describeLinkFailure(err)));
    }
  }, [kind]);

  useEffect(() => {
    // Strict Mode runs this twice: the second run would find the fragment already cleared.
    if (token.current !== undefined) return;
    token.current = readTokenFromHash(window.location.hash);
    window.history.replaceState(null, '', window.location.pathname);
    void inspect();
  }, [inspect]);

  async function submit() {
    if (phase.name !== 'ready' || !token.current) return;
    if (password !== confirm) return setPhase({ name: 'ready', error: 'As senhas não conferem.' });
    if (kind === 'pin') {
      if (!/^\d{6}$/.test(pin)) return setPhase({ name: 'ready', error: 'O PIN deve ter 6 números.' });
      if (pin !== confirmPin) return setPhase({ name: 'ready', error: 'Os PINs não conferem.' });
    }
    setPhase({ name: 'submitting' });
    try {
      await (kind === 'pin'
        ? apiClient.confirmPinReset(token.current, password, confirm, pin, confirmPin)
        : apiClient.confirmPasswordReset(token.current, password, confirm));
      token.current = null;
      setPhase({ name: 'done' });
    } catch (err) {
      // Only a refused password (code from the server) keeps the link alive (AC-20); any other 400 is a refused link.
      if (err instanceof ApiError && err.status === 400 && err.code === 'INVALID_PASSWORD') {
        return setPhase({ name: 'ready', error: err.message });
      }
      const failure = describeLinkFailure(err);
      setPhase(failure.name === 'failed' ? { name: 'ready', error: failure.message } : toPhase(failure));
    }
  }

  return {
    phase,
    password,
    setPassword,
    confirm,
    setConfirm,
    pin,
    setPin: (value: string) => setPin(sanitizePin(value)),
    confirmPin,
    setConfirmPin: (value: string) => setConfirmPin(sanitizePin(value)),
    submit,
    retry: inspect,
  };
}
