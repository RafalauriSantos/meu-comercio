'use client';

import React, { useEffect, useState } from 'react';
import type { ProductItem } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { createEscapeDismiss } from '@/frontend/lib/dismiss-on-escape';
import { Money } from '@/shared/domain/money';
import { formatQuantity, lineSubtotal } from '@/shared/domain/product-unit';
import { parseWeightInput } from './weight-input';

interface WeightPromptProps {
  product: ProductItem;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
}

/** Asks the weight of a product sold by weight, and shows what that weight costs before it is added. */
export function WeightPrompt({ product, onConfirm, onCancel }: WeightPromptProps) {
  const [text, setText] = useState('');
  const grams = parseWeightInput(text);
  const total = grams ? lineSubtotal(Money.fromDecimal(product.salePrice), grams, 'KG') : null;
  const tooMuch = grams !== null && grams > product.availableQuantity;

  // Esc closes this window only; it must not also clear the sale.
  useEffect(() => {
    const handleEscape = createEscapeDismiss(onCancel);
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (grams && !tooMuch) onConfirm(grams);
  }

  return (
    <div className="pdv-overlay">
      <form className="pdv-modal is-narrow" role="dialog" aria-modal="true" aria-labelledby="pdv-weight-title" onSubmit={handleSubmit}>
        <div className="pdv-modal-body">
          <p className="pdv-eyebrow">Produto vendido por peso</p>
          <h2 id="pdv-weight-title" className="pdv-title">
            {product.name}
          </h2>
          <p className="muted pdv-modal-text">
            {formatMoney(product.salePrice)} por kg · em estoque: {formatQuantity(product.availableQuantity, 'KG')}
          </p>

          <label className="field-label" htmlFor="pdv-weight-input">
            Peso da balança
          </label>
          <input
            id="pdv-weight-input"
            className="input pdv-weight-input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="350 (gramas) ou 0,350 (kg)"
            aria-describedby="pdv-weight-preview"
          />
          <p id="pdv-weight-preview" className="pdv-weight-preview num" aria-live="polite">
            {grams && total ? (
              tooMuch ? (
                <span className="pdv-weight-warn">Só há {formatQuantity(product.availableQuantity, 'KG')} em estoque.</span>
              ) : (
                <>
                  {formatQuantity(grams, 'KG')} = <strong>{total.formatBrl()}</strong>
                </>
              )
            ) : (
              <span className="muted">Digite só números: sem vírgula são gramas, com vírgula são quilos.</span>
            )}
          </p>
        </div>

        <footer className="pdv-modal-foot">
          <button className="outline pdv-back" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary pdv-weight-add" type="submit" disabled={!grams || tooMuch}>
            Adicionar à venda
          </button>
        </footer>
      </form>
    </div>
  );
}
