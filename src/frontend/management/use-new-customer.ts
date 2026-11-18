'use client';

import React, { useState, useRef } from 'react';
import { apiClient } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import {
  EMPTY_NEW_CUSTOMER,
  buildNewCustomerPayload,
  newCustomerSuccessText,
  type NewCustomerDraft,
} from '@/frontend/management/new-customer';

interface UseNewCustomerParams {
  setFeedback: (feedback: { text: string; isError?: boolean; isSuccess?: boolean } | null) => void;
  setProcessing: (processing: boolean) => void;
  reload: () => Promise<unknown>;
}

/** State and actions of registering a customer in the side panel. Called by useCustomersTab, so the draft survives a tab change. */
export function useNewCustomer({ setFeedback, setProcessing, reload }: UseNewCustomerParams) {
  const [isOpen, setIsOpen] = useState(false);
  // The panel plays its exit while closing; it calls finishClose at the end, and only then it is unmounted.
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<NewCustomerDraft>(EMPTY_NEW_CUSTOMER);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function open() {
    setClosing(false);
    setIsOpen(true);
    setDraft(EMPTY_NEW_CUSTOMER);
    setError(null);
  }

  function close() {
    setClosing(true);
  }

  function finishClose() {
    setIsOpen(false);
    setClosing(false);
    setError(null);
    setDraft(EMPTY_NEW_CUSTOMER);
  }

  function changeDraft(change: Partial<NewCustomerDraft>) {
    setDraft((cur) => ({ ...cur, ...change }));
  }

  async function handleSubmit(e: React.FormEvent, isOwner: boolean) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    setError(null);
    try {
      await apiClient.createCustomer(buildNewCustomerPayload(draft, isOwner));
      // The PIN is cleared right after the send, on success too, not only when the panel finishes closing.
      changeDraft({ ownerPin: '' });
      setFeedback({ text: newCustomerSuccessText(isOwner), isSuccess: true });
      close();
      await reload();
    } catch (err) {
      // A wrong PIN is typed again; the rest of the form stays.
      changeDraft({ ownerPin: '' });
      setError(getErrorMessage(err, 'Erro ao cadastrar cliente.'));
    } finally {
      setProcessing(false);
    }
  }

  return { isOpen, closing, draft, error, nameRef, open, close, finishClose, changeDraft, handleSubmit };
}
