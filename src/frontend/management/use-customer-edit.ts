'use client';

import React, { useState, useRef } from 'react';
import { apiClient, type CustomerItem } from '@/frontend/lib/api-client';
import { deletedNotice, submitCustomerActive } from '@/frontend/management/deactivate';
import { useDeleteConfirm } from '@/frontend/management/use-delete-confirm';
import { draftFromCustomer, limitRaised, submitCustomerEdit, type CustomerDraft, type CustomerEditError } from '@/frontend/management/customer-edit';

interface UseCustomerEditParams {
  setFeedback: (feedback: { text: string; isError?: boolean; isSuccess?: boolean } | null) => void;
  setProcessing: (processing: boolean) => void;
  applyEdit: (item: CustomerItem) => void;
  /** The customer was excluded: the list drops it and the excluded list is read again. */
  applyDeleted: (item: CustomerItem) => void;
  /** Loads the list again and returns it (null when it failed). */
  reload: () => Promise<CustomerItem[] | null>;
}

/** State and actions of editing one customer of the list. Called by useCustomersTab, so the draft survives a tab change. */
export function useCustomerEdit({ setFeedback, setProcessing, applyEdit, applyDeleted, reload }: UseCustomerEditParams) {
  // A copy taken on open: its updatedAt and original values do not change if the list is loaded again.
  const [target, setTarget] = useState<CustomerItem | null>(null);
  // The panel plays its exit while closing; it calls finishClose at the end, and only then the target is dropped.
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>({ name: '', phone: '', limit: '', creditBlocked: false, ownerPin: '' });
  const [error, setError] = useState<CustomerEditError | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const del = useDeleteConfirm();

  function open(customer: CustomerItem) {
    setClosing(false);
    setTarget(customer);
    setDraft(draftFromCustomer(customer));
    setError(null);
    del.reset();
  }

  function close() {
    setClosing(true);
    del.reset();
  }

  function finishClose() {
    setTarget(null);
    setClosing(false);
    setError(null);
    changeDraft({ ownerPin: '' });
  }

  function changeDraft(change: Partial<CustomerDraft>) {
    setDraft((cur) => {
      const next = { ...cur, ...change };
      // When the limit goes back to the original (or lower), the PIN field disappears: do not keep what was typed.
      if (target && 'limit' in change && !limitRaised(target, next)) next.ownerPin = '';
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setProcessing(true);
    setFeedback(null);
    setError(null);
    try {
      const result = await submitCustomerEdit(apiClient.updateCustomer, target, draft);
      changeDraft({ ownerPin: '' });
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

  // The PIN goes with the request and is dropped at once, whatever the answer.
  async function handleDelete() {
    if (!target) return;
    const ownerPin = del.pin;
    del.clearPin();
    setProcessing(true);
    setFeedback(null);
    del.setError(null);
    try {
      const result = await submitCustomerActive(apiClient.updateCustomer, target, false, ownerPin);
      if (result.kind === 'failed') {
        del.setError({ text: result.text, reload: result.reload });
        return;
      }
      applyDeleted(result.item);
      setFeedback({ text: deletedNotice(target.name), isSuccess: true });
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
    deleteFlow: {
      asking: del.asking,
      pin: del.pin,
      error: del.error,
      onAsk: del.ask,
      onCancel: del.reset,
      onPin: del.changePin,
      onConfirm: handleDelete,
      onReload: handleReload,
    },
  };
}
