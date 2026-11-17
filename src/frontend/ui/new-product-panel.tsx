import React, { useId, useRef } from 'react';
import { maskCurrencyDigits } from '@/frontend/lib/currency-mask';
import { noticeView } from '@/frontend/ui/notice-view';
import type { ProductUnit } from '@/shared/domain/product-unit';
import { useDialogPanel } from '@/frontend/lib/use-dialog-panel';

export const SCAN_DURING_NEW_NOTICE = 'Termine ou cancele o cadastro antes de bipar outro produto.';

interface NewProductPanelProps {
  barcode: string;
  name: string;
  unit: ProductUnit;
  price: string;
  stock: string;
  stockControl: boolean;
  processing: boolean;
  barcodeNote: string | null;
  scanWarning: boolean;
  closing: boolean;
  error: string | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onBarcode: (value: string) => void;
  onName: (value: string) => void;
  onUnit: (value: ProductUnit) => void;
  onPrice: (value: string) => void;
  onStock: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onClosed: () => void;
  onBarcodeBlur: (code: string) => void;
  onBarcodeKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** The form of a new product, in the same side panel as the edit (a modal <dialog>). It only draws: the state is in use-products-tab.ts. */
export function NewProductPanel({
  barcode,
  name,
  unit,
  price,
  stock,
  stockControl,
  processing,
  barcodeNote,
  scanWarning,
  closing,
  error,
  nameRef,
  onBarcode,
  onName,
  onUnit,
  onPrice,
  onStock,
  onSubmit,
  onCancel,
  onClosed,
  onBarcodeBlur,
  onBarcodeKeyDown,
}: NewProductPanelProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  // The focus starts in the barcode field; after a scan the tab moves it to the name.
  useDialogPanel(dialogRef, barcodeRef, closing, onClosed);
  return (
    // Esc sends `cancel`: the app closes the panel (and keeps the draft) instead of the browser closing only the <dialog>.
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
        <h2 id={titleId}>Novo produto</h2>
        <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={onCancel}>
          ×
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="mg-panel-body">
          <div>
            <label className="field-label" htmlFor="np-barcode">Código de Barras</label>
            <input
              id="np-barcode"
              ref={barcodeRef}
              className="input"
              autoComplete="off"
              value={barcode}
              onChange={(e) => onBarcode(e.target.value)}
              onKeyDown={onBarcodeKeyDown}
              onBlur={(e) => onBarcodeBlur(e.target.value)}
              placeholder="Gerado automaticamente se ficar vazio"
            />
            {barcodeNote && (
              <span className="mg-help mg-help-warn" role="alert">
                {barcodeNote}
              </span>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="np-name">Nome do Produto</label>
            <input
              id="np-name"
              ref={nameRef}
              className="input"
              required
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Ex: Arroz Tipo 1 5kg"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="np-unit">Como é vendido</label>
            <select
              id="np-unit"
              className="input"
              value={unit}
              onChange={(e) => onUnit(e.target.value === 'KG' ? 'KG' : 'UN')}
            >
              <option value="UN">Por unidade</option>
              <option value="KG">Por peso (preço por quilo)</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="np-price">
              {unit === 'KG' ? 'Preço por Quilo (R$)' : 'Preço de Venda (R$)'}
            </label>
            <input
              id="np-price"
              className="input num"
              type="text"
              inputMode="numeric"
              required
              value={price}
              onChange={(e) => onPrice(maskCurrencyDigits(e.target.value))}
              placeholder="24,90"
            />
          </div>
          {stockControl && (
          <div>
            <label className="field-label" htmlFor="np-stock">
              {unit === 'KG' ? 'Estoque Inicial (kg)' : 'Estoque Inicial'}
            </label>
            <input
              id="np-stock"
              className="input num"
              type={unit === 'KG' ? 'text' : 'number'}
              inputMode={unit === 'KG' ? 'decimal' : undefined}
              min={unit === 'KG' ? undefined : '0'}
              value={stock}
              onChange={(e) => onStock(e.target.value)}
            />
          </div>
          )}
          {scanWarning && (
            <span className="mg-help mg-help-warn" role="status">
              {SCAN_DURING_NEW_NOTICE}
            </span>
          )}
          {error && <div {...noticeView({ text: error, isError: true })}>{error}</div>}
        </div>
        <div className="mg-panel-foot">
          <div className="mg-panel-actions">
            <button className="outline" type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={processing}>
              {processing ? 'Salvando...' : 'Salvar Produto'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
