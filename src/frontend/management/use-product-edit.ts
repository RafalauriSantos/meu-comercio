'use client';

import React, { useState, useRef } from 'react';
import { apiClient, type ProductItem } from '@/frontend/lib/api-client';
import { deletedNotice, submitProductActive } from '@/frontend/management/deactivate';
import { useDeleteConfirm } from '@/frontend/management/use-delete-confirm';
import { findProductWithBarcode, InactiveBarcodeError, takenBarcodeMessage } from '@/frontend/management/barcode-check';
import {
  GENERATE_BARCODE_QUESTION,
  draftFromProduct,
  submitGenerateBarcode,
  submitProductEdit,
  type EditDraft, type EditError } from '@/frontend/management/product-edit';

interface UseProductEditParams {
  setFeedback: (feedback: { text: string; isError?: boolean; isSuccess?: boolean } | null) => void;
  setProcessing: (processing: boolean) => void;
  applyEdit: (item: ProductItem) => void;
  /** The product was excluded: the list drops it and the excluded list is read again. */
  applyDeleted: (item: ProductItem) => void;
  reload: () => Promise<void>;
}

/** State and actions of editing one product of the list. Called by useProductsTab, so the draft survives a tab change. */
export function useProductEdit({ setFeedback, setProcessing, applyEdit, applyDeleted, reload }: UseProductEditParams) {
  // A copy taken on open: its updatedAt and original values do not change if the list is loaded again.
  const [target, setTarget] = useState<ProductItem | null>(null);
  // The panel plays its exit while closing; it calls finishClose at the end, and only then the target is dropped.
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({ name: '', price: '', barcode: '' });
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
  const [error, setError] = useState<EditError | null>(null);
  // A barcode scan while the panel is open: the panel shows the notice (the page feedback is behind the modal).
  const [scanWarning, setScanWarning] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const del = useDeleteConfirm();

  function open(product: ProductItem) {
    setClosing(false);
    setTarget(product);
    setDraft(draftFromProduct(product));
    setBarcodeNote(null);
    setError(null);
    setScanWarning(false);
    del.reset();
  }

  function close() {
    setClosing(true);
    del.reset();
  }

  function finishClose() {
    setTarget(null);
    setClosing(false);
    setBarcodeNote(null);
    setError(null);
    setScanWarning(false);
  }

  function changeDraft(change: Partial<EditDraft>) {
    setDraft((cur) => ({ ...cur, ...change }));
    if (change.barcode !== undefined) setBarcodeNote(null);
  }

  // Warns when the code is another product's. The product itself does not count, and a failed lookup stays silent: the server decides.
  async function checkBarcode(code: string) {
    if (!target || code.trim() === target.barcode) return;
    try {
      const existing = await findProductWithBarcode(apiClient.findProductByBarcode, code);
      setBarcodeNote(existing && existing.id !== target.id ? takenBarcodeMessage(existing) : null);
    } catch (err) {
      setBarcodeNote(err instanceof InactiveBarcodeError ? err.message : null);
    }
  }

  // The scanner sends Enter after the code: check it and go to the name instead of submitting the form.
  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void checkBarcode(e.currentTarget.value);
    nameRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setProcessing(true);
    setFeedback(null);
    setError(null);
    try {
      const result = await submitProductEdit(apiClient.updateProduct, target, draft);
      if (result.kind === 'failed') {
        setError({ text: result.text, reload: result.reload });
        return;
      }
      if (result.kind === 'saved') {
        applyEdit(result.item);
        setFeedback({ text: 'Produto atualizado.', isSuccess: true });
      }
      close();
    } finally {
      setProcessing(false);
    }
  }

  // The server picks the code; the panel only asks first and shows the new code once saved.
  async function handleGenerateBarcode() {
    if (!target) return;
    if (!confirm(GENERATE_BARCODE_QUESTION)) return;
    setProcessing(true);
    setFeedback(null);
    setError(null);
    try {
      const result = await submitGenerateBarcode(apiClient.updateProduct, target);
      if (result.kind === 'failed') {
        setError({ text: result.text, reload: result.reload });
        return;
      }
      if (result.kind === 'saved') {
        applyEdit(result.item);
        setFeedback({ text: `Código gerado: ${result.item.barcode}`, isSuccess: true });
      }
      close();
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    if (!target) return;
    setProcessing(true);
    setFeedback(null);
    del.setError(null);
    try {
      const result = await submitProductActive(apiClient.updateProduct, target, false);
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

  // Closes the edit and loads the list again: the way out of a conflict.
  async function handleReload() {
    close();
    await reload();
  }

  return {
    targetId: target && !closing ? target.id : null,
    target,
    closing,
    draft,
    barcodeNote,
    error,
    scanWarning,
    setScanWarning,
    nameRef,
    open,
    close,
    finishClose,
    changeDraft,
    checkBarcode,
    handleBarcodeKeyDown,
    handleSubmit,
    handleGenerateBarcode,
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
