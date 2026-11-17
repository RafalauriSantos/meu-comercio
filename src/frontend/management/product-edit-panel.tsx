import React, { useId, useRef } from 'react';
import type { ProductItem } from '@/frontend/lib/api-client';
import { maskCurrencyDigits } from '@/frontend/lib/currency-mask';
import { noticeView } from '@/frontend/ui/notice-view';
import {
  BARCODE_CHANGE_WARNING,
  PRICE_CHANGE_WARNING,
  SCAN_DURING_EDIT_NOTICE,
  barcodeChanged,
  buildProductPatch,
  isDraftValid,
  priceChanged,
  type EditDraft,
  type EditError,
} from '@/frontend/management/product-edit';
import { useDialogPanel } from '@/frontend/management/use-dialog-panel';

interface ProductEditPanelProps {
  target: ProductItem;
  draft: EditDraft;
  processing: boolean;
  barcodeNote: string | null;
  scanWarning: boolean;
  closing: boolean;
  error: EditError | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onDraft: (change: Partial<EditDraft>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onClosed: () => void;
  onReload: () => void;
  onBarcodeBlur: (code: string) => void;
  onBarcodeKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** The edit form of one product, in a side panel (a modal <dialog>). It only draws: the rules are in product-edit.ts. */
export function ProductEditPanel({
  target,
  draft,
  processing,
  barcodeNote,
  scanWarning,
  closing,
  error,
  nameRef,
  onDraft,
  onSubmit,
  onCancel,
  onClosed,
  onReload,
  onBarcodeBlur,
  onBarcodeKeyDown,
}: ProductEditPanelProps) {
  const id = target.id;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogPanel(dialogRef, nameRef, closing, onClosed);
  const unchanged = buildProductPatch(target, draft) === null;
  const cannotSave = processing || !isDraftValid(draft) || unchanged;
  return (
    // Esc sends `cancel`: the app closes the panel (and its state) instead of the browser closing only the <dialog>.
    <dialog
      ref={dialogRef}
      className="mg-panel"
      aria-labelledby={titleId}
      data-closing={closing || undefined}
      inert={closing}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="mg-panel-head">
        <h2 id={titleId}>Editar produto</h2>
        <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={onCancel}>
          ×
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="mg-panel-body">
          <div>
            <label className="field-label" htmlFor={`edit-name-${id}`}>Nome do Produto</label>
            <input
              id={`edit-name-${id}`}
              ref={nameRef}
              className="input"
              required
              value={draft.name}
              onChange={(e) => onDraft({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`edit-price-${id}`}>
              {target.unit === 'KG' ? 'Preço por Quilo (R$)' : 'Preço de Venda (R$)'}
            </label>
            <input
              id={`edit-price-${id}`}
              className="input num"
              type="text"
              inputMode="numeric"
              required
              value={draft.price}
              onChange={(e) => onDraft({ price: maskCurrencyDigits(e.target.value) })}
            />
            {priceChanged(target, draft) && (
              <span className="mg-help mg-help-warn" role="status">
                {PRICE_CHANGE_WARNING}
              </span>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor={`edit-barcode-${id}`}>Código de Barras</label>
            <input
              id={`edit-barcode-${id}`}
              className="input"
              required
              autoComplete="off"
              value={draft.barcode}
              onChange={(e) => onDraft({ barcode: e.target.value })}
              onKeyDown={onBarcodeKeyDown}
              onBlur={(e) => onBarcodeBlur(e.target.value)}
            />
            {barcodeNote && (
              <span className="mg-help mg-help-warn" role="alert">
                {barcodeNote}
              </span>
            )}
            {barcodeChanged(target, draft) && (
              <span className="mg-help mg-help-warn" role="status">
                {BARCODE_CHANGE_WARNING}
              </span>
            )}
          </div>
          {scanWarning && (
            <span className="mg-help mg-help-warn" role="status">
              {SCAN_DURING_EDIT_NOTICE}
            </span>
          )}
          {error && (
            <div {...noticeView({ text: error.text, isError: true })}>
              {error.text}
              {error.reload && (
                <button type="button" className="outline" onClick={onReload}>
                  Recarregar a lista
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mg-panel-foot">
          {unchanged && <div className="mg-panel-hint">Altere algo para poder salvar.</div>}
          <div className="mg-panel-actions">
            <button className="outline" type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={cannotSave}>
              {processing ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
