'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/frontend/lib/api-client';
import { describeLinkFailure, readTokenFromHash, type LinkFailure } from './verify-email-link';

export type VerifyPhase =
  | { name: 'reading' }
  | { name: 'ready'; email: string; error?: string }
  | { name: 'confirming'; email: string }
  | { name: 'done'; email: string }
  | LinkFailure;

/**
 * State of the page that opens the link of the e-mail. Opening only reads the link; the e-mail is confirmed on
 * the click (a mail scanner that opens the link must not confirm it). The code is read from the URL fragment,
 * the fragment is cleared, and the code lives only in a ref and in the body of the two calls.
 */
export function useVerifyEmail() {
  const token = useRef<string | null | undefined>(undefined); // undefined: the fragment was not read yet
  const [phase, setPhase] = useState<VerifyPhase>({ name: 'reading' });

  const inspect = useCallback(async () => {
    if (!token.current) return setPhase({ name: 'invalid' });
    setPhase({ name: 'reading' });
    try {
      const { email } = await apiClient.inspectEmailVerification(token.current);
      setPhase({ name: 'ready', email });
    } catch (err) {
      setPhase(describeLinkFailure(err));
    }
  }, []);

  useEffect(() => {
    // Strict Mode runs this twice: the second run would find the fragment already cleared.
    if (token.current !== undefined) return;
    token.current = readTokenFromHash(window.location.hash);
    window.history.replaceState(null, '', window.location.pathname);
    void inspect();
  }, [inspect]);

  async function confirm() {
    if (phase.name !== 'ready' || !token.current) return;
    const { email } = phase;
    setPhase({ name: 'confirming', email });
    try {
      await apiClient.confirmEmailVerification(token.current);
      token.current = null;
      setPhase({ name: 'done', email });
    } catch (err) {
      const failure = describeLinkFailure(err);
      setPhase(failure.name === 'failed' ? { name: 'ready', email, error: failure.message } : failure);
    }
  }

  return { phase, confirm, retry: inspect };
}
