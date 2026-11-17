'use client';

import React, { useRef, useState } from 'react';
import { apiClient, type ProductItem } from '@/frontend/lib/api-client';
import { getErrorMessage, parseCurrencyInput } from '@/frontend/lib/formatters';
import type { ProductUnit } from '@/shared/domain/product-unit';
import { newProductError } from '@/frontend/pdv/register-on-scan';

/**
 * The new product panel of the sales screen, opened by a scan the catalog does not know.
 * Closing without saving puts nothing in the cart; a saved product goes to `onRegistered`.
 */
export function useRegisterOnScan(onRegistered: (product: ProductItem) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('UN');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // Refs, not state: two scans or two clicks in the same tick must not open two panels or save twice.
  const openRef = useRef(false);
  const savingRef = useRef(false);
  // The saved product waits for the panel to leave, so the weight window of a KG product opens with nothing above it.
  const savedRef = useRef<ProductItem | null>(null);

  function open(code: string) {
    if (openRef.current) return;
    openRef.current = true;
    setBarcode(code);
    setName('');
    setUnit('UN');
    setPrice('');
    setError(null);
    setClosing(false);
    setIsOpen(true);
  }

  // A save in flight cannot be cancelled: the product would be created and not added.
  function cancel() {
    if (savingRef.current) return;
    setClosing(true);
  }

  function finishClose() {
    openRef.current = false;
    setIsOpen(false);
    setClosing(false);
    const saved = savedRef.current;
    savedRef.current = null;
    if (saved) onRegistered(saved);
  }

  // The reader sends Enter after the code: go to the name instead of sending the form.
  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    nameRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const invalid = newProductError({ name, price });
    if (invalid) {
      setError(invalid);
      return;
    }
    savingRef.current = true;
    setProcessing(true);
    setError(null);
    try {
      const created = await apiClient.createProduct({
        barcode: barcode.trim(),
        name: name.trim(),
        salePrice: parseCurrencyInput(price),
        unit,
      });
      savedRef.current = created;
      setClosing(true);
    } catch (err) {
      // 400, 409 (code taken) and failures: the server message, the panel stays open with what was typed.
      setError(getErrorMessage(err, 'Erro ao cadastrar produto.'));
    } finally {
      savingRef.current = false;
      setProcessing(false);
    }
  }

  return {
    isOpen,
    closing,
    barcode,
    name,
    unit,
    price,
    error,
    processing,
    nameRef,
    open,
    cancel,
    finishClose,
    setBarcode,
    setName,
    setUnit,
    setPrice,
    handleBarcodeKeyDown,
    submit,
  };
}
