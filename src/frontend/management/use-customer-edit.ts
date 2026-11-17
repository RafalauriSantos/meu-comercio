'use client';

import React, { useState, useRef } from 'react';
import { apiClient, type CustomerItem } from '@/frontend/lib/api-client';
import { draftFromCustomer, submitCustomerEdit, type CustomerDraft, type CustomerEditError } from '@/frontend/management/customer-edit';

interface UseCustomerEditParams {
  setFeedback: (feedback: { text: string; isError?: boolean; isSuccess?: boolean } | null) => void;
  setProcessing: (processing: boolean) => void;
  applyEdit: (item: CustomerItem) => void;
  /** Loads the list again and returns it (null when it failed). */
  reload: () => Promise<CustomerItem[] | null>;
}

/** State and actions of editing one customer of the list. Called by useCustomersTab, so the draft survives a tab change. */
export function useCustomerEdit({ setFeedback, setProcessing, applyEdit, reload }: UseCustomerEditParams) {
  // A copy taken on open: its updatedAt and original values do not change if the list is loaded again.
  const [target, setTarget] = useState<CustomerItem | null>(null);
  // The panel plays its exit while closing; it calls finishClose at the end, and only then the target is dropped.
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>({ name: '', phone: '', limit: '' });
  const [error, setError] = useState<CustomerEditError | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function open(customer: CustomerItem) {
    setClosing(false);
    setTarget(customer);
    setDraft(draftFromCustomer(customer));
    setError(null);
  }

  function close() {
    setClosing(true);
  }

  function finishClose() {
    setTarget(null);
    setClosing(false);
    setError(null);
  }

  function changeDraft(change: Partial<CustomerDraft>) {
    setDraft((cur) => ({ ...cur, ...change }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setProcessing(true);
    setFeedback(null);
    setError(null);
    try {
      const result = await submitCustomerEdit(apiClient.updateCustomer, target, draft);
      if (result.kind === 'failed') {
        setError({ text: result.text, reload: result.reload });
        return;
      }
      if (result.kind === 'saved') {
        applyEdit(result.item);
        setFeedback({ text: 'Cliente atualizado.', isSuccess: true });
      }
      close();
    } finally {
      setProcessing(false);
    }
  }

  // Loads the list again and opens the panel with the new data: nothing typed is saved over a change in silence.
  async function handleReload() {
    if (!target) return;
    const list = await reload();
    const fresh = list?.find((c) => c.id === target.id);
    if (fresh) open(fresh);
    else if (list) close();
    else setError({ text: 'Não foi possível recarregar agora. Tente de novo.', reload: true });
  }

  return {
    target,
    closing,
    draft,
    error,
    nameRef,
    open,
    close,
    finishClose,
    changeDraft,
    handleSubmit,
    handleReload,
  };
}
