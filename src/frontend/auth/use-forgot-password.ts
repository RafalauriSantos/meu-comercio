'use client';

import { useState } from 'react';
import { apiClient, ApiError, loadErrorMessage } from '@/frontend/lib/api-client';
import { useResendCountdown } from '@/frontend/lib/use-resend-countdown';
import { FORGOT_RATE_LIMIT_MESSAGE } from './forgot-password-view';

export type ForgotPhase = { name: 'form'; error?: string } | { name: 'sending' } | { name: 'sent' };

/**
 * State of the "forgot password" page. Every accepted request ends in the same "sent" phase, whether the
 * e-mail exists or not (AC-13); the text shown there is fixed, never read from the answer.
 */
export function useForgotPassword(kind: 'password' | 'pin' = 'password') {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [phase, setPhase] = useState<ForgotPhase>({ name: 'form' });
  const countdown = useResendCountdown();

  async function submit() {
    if (phase.name === 'sending') return;
    // A robot filled the hidden field: same screen as a real request, no call.
    if (honeypot) {
      countdown.start();
      return setPhase({ name: 'sent' });
    }
    setPhase({ name: 'sending' });
    try {
      await (kind === 'pin' ? apiClient.requestPinReset(email) : apiClient.requestPasswordReset(email));
      countdown.start();
      setPhase({ name: 'sent' });
    } catch (err) {
      const rateLimited = err instanceof ApiError && err.status === 429;
      setPhase({ name: 'form', error: rateLimited ? FORGOT_RATE_LIMIT_MESSAGE : loadErrorMessage(err) });
    }
  }

  return { phase, email, setEmail, honeypot, setHoneypot, seconds: countdown.seconds, submit };
}
