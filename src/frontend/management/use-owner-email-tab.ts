'use client';

import React, { useState, useCallback } from 'react';
import { apiClient, OwnerEmailStatus } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import { useResendCountdown } from '@/frontend/lib/use-resend-countdown';

interface UseOwnerEmailTabParams {
  setProcessing: (processing: boolean) => void;
  setLoadFailed: (update: (f: { ownerEmail?: boolean }) => { ownerEmail?: boolean }) => void;
}

/** State, load and actions of the recovery e-mail tab (owner only). Called by the page, so the banner and the tab share it. */
export function useOwnerEmailTab({ setProcessing, setLoadFailed }: UseOwnerEmailTabParams) {
  // Null until the read answers: without a known state the banner stays hidden.
  const [status, setStatus] = useState<OwnerEmailStatus | null>(null);
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useResendCountdown();

  const loadOwnerEmail = useCallback(async () => {
    try {
      setStatus(await apiClient.getOwnerEmail());
      setLoadFailed((f) => ({ ...f, ownerEmail: false }));
    } catch (err) {
      setLoadFailed((f) => ({ ...f, ownerEmail: true }));
      console.error('Erro ao carregar o e-mail de recuperação:', err);
    }
  }, [setLoadFailed]);

  // One send, whichever call: the link goes out, the wait of 60 s starts, and the e-mail is saved as not confirmed.
  async function send(call: () => Promise<{ email: string }>) {
    setProcessing(true);
    setError(null);
    setSentTo(null);
    try {
      const sent = await call();
      setStatus({ email: sent.email, verified: false });
      setSentTo(sent.email);
      setEmail('');
      setCurrentPassword('');
      countdown.start();
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível enviar o link.'));
    } finally {
      setProcessing(false);
    }
  }

  // A new e-mail (first one, or a change) asks for the current password; the server checks it.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { email: email.trim(), currentPassword };
    await send(() => (status?.email ? apiClient.changeOwnerEmail(payload) : apiClient.requestEmailVerification(payload)));
  }

  // The link again to the saved e-mail: no password. The server keeps the 60 s; this only tells the person.
  async function handleResend() {
    if (countdown.seconds > 0) return;
    await send(() => apiClient.requestEmailVerification());
  }

  return {
    status,
    email,
    setEmail,
    currentPassword,
    setCurrentPassword,
    sentTo,
    error,
    seconds: countdown.seconds,
    loadOwnerEmail,
    handleSubmit,
    handleResend,
  };
}
