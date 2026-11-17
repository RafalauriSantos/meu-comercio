import React from 'react';
import type { ProductItem } from '@/frontend/lib/api-client';
import { maskCurrencyDigits } from '@/frontend/lib/currency-mask';
import { noticeView } from '@/frontend/ui/notice-view';
import {
  BARCODE_CHANGE_WARNING,
  PRICE_CHANGE_WARNING,
  barcodeChanged,
  buildProductPatch,
  isDraftValid,
  priceChanged,
  type EditDraft,
  type EditError,
} from '@/frontend/management/product-edit';

interface ProductEditRowProps {
  target: ProductItem;
  draft: EditDraft;
  colSpan: number;
  processing: boolean;
  barcodeNote: string | null;
  error: EditError | null;
  nameRef: React.Ref<HTMLInputElement>;
  onDraft: (change: Partial<EditDraft>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onReload: () => void;
  onBarcodeBlur: (code: string) => void;
  onBarcodeKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** The edit form of one product, in a row under it. It only draws: the rules are in product-edit.ts. */
export function ProductEditRow({
  target,
  draft,
  colSpan,
  processing,
  barcodeNote,
  error,
  nameRef,
  onDraft,
  onSubmit,
  onCancel,
  onReload,
  onBarcodeBlur,
  onBarcodeKeyDown,
}: ProductEditRowProps) {
  const id = target.id;
  const cannotSave = processing || !isDraftValid(draft) || buildProductPatch(target, draft) === null;
  return (
    <tr className="mg-restock-row">
      <td colSpan={colSpan}>
        <form onSubmit={onSubmit}>
          <div className="mg-form-grid">
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
          </div>
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
          <button className="primary mg-form-submit" type="submit" disabled={cannotSave}>
            {processing ? 'Salvando...' : 'Salvar'}
          </button>
          <button className="outline" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </form>
      </td>
    </tr>
  );
}
