'use client';

import React, { useEffect, useState } from 'react';
import { apiClient, type RecentSaleItem } from '@/frontend/lib/api-client';
import { formatMoney, getErrorMessage } from '@/frontend/lib/formatters';
import { createEscapeDismiss } from '@/frontend/lib/dismiss-on-escape';
import { formatSaleTime, isOwnerPin, isReasonValid } from './cancel-sale';

interface CancelSaleModalProps {
  onClose: () => void;
  /** Called after the sale was cancelled, with the short id of the sale. */
  onCancelled: (shortId: string) => void;
}

/**
 * Cancels a sale that was already finished (not the one being rung up): the person at the counter picks it from
 * the sales of today, the owner types her PIN, and the items go back to the stock and the money is refunded.
 */
export function CancelSaleModal({ onClose, onCancelled }: CancelSaleModalProps) {
  const [recent, setRecent] = useState<RecentSaleItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    apiClient
      .listRecentSales()
      .then((result) => {
        if (current) setRecent(result.items);
      })
      .catch((err: unknown) => {
        if (current) setLoadError(getErrorMessage(err, 'Não foi possível carregar as vendas de hoje.'));
      });
    return () => {
      current = false;
    };
  }, []);

  // Esc closes this window only; it must not also clear the sale being rung up.
  useEffect(() => {
    const handleEscape = createEscapeDismiss(onClose);
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  const canSubmit = !!selectedId && isOwnerPin(ownerPin) && isReasonValid(reason) && !processing;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setProcessing(true);
    setError(null);
    try {
      await apiClient.cancelSale(selectedId, { ownerPin: ownerPin.trim(), reason: reason.trim() });
      onCancelled(selectedId.slice(0, 8));
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cancelar a venda.'));
      setProcessing(false);
    }
  }

  return (
    <div className="pdv-overlay">
      <form className="pdv-modal" role="dialog" aria-modal="true" aria-labelledby="pdv-cancel-sale-title" onSubmit={handleSubmit}>
        <div className="pdv-modal-body">
          <p className="pdv-eyebrow">Segurança e auditoria</p>
          <h2 id="pdv-cancel-sale-title" className="pdv-title">
            Cancelar venda finalizada
          </h2>
          <p className="muted pdv-modal-text">
            Escolha a venda de hoje. Os itens voltam ao estoque, o dinheiro é estornado do caixa e o fiado, se houver,
            é desfeito. Precisa do PIN da proprietária.
          </p>

          <fieldset className="pdv-sale-list">
            <legend className="field-label">Vendas de hoje</legend>
            {recent === null && !loadError && <p className="muted" role="status">Carregando as vendas de hoje...</p>}
            {loadError && <p className="error" role="alert">{loadError}</p>}
            {recent && recent.length === 0 && <p className="muted">Nenhuma venda finalizada hoje.</p>}
            {recent?.map((sale) => (
              <label key={sale.id} className="pdv-sale-option">
                <input
                  type="radio"
                  name="sale-to-cancel"
                  value={sale.id}
                  checked={selectedId === sale.id}
                  onChange={() => setSelectedId(sale.id)}
                />
                <span className="pdv-sale-main">
                  <span className="pdv-sale-top">
                    <strong className="num">{formatSaleTime(sale.createdAt)}</strong>
                    <strong className="num">{formatMoney(sale.total)}</strong>
                  </span>
                  <span className="pdv-sale-items">{sale.items || 'Sem itens'}</span>
                  <span className="pdv-sale-meta num">
                    {sale.operatorId} · venda {sale.shortId}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="pdv-field">
            <label className="field-label" htmlFor="cancel-owner-pin">
              PIN da proprietária (6 dígitos)
            </label>
            <input
              id="cancel-owner-pin"
              className="input pdv-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              required
              value={ownerPin}
              onChange={(e) => setOwnerPin(e.target.value)}
              placeholder="••••••"
            />
          </div>

          <div className="pdv-field">
            <label className="field-label" htmlFor="cancel-reason">
              Motivo do cancelamento (mínimo 3 caracteres)
            </label>
            <input
              id="cancel-reason"
              className="input"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: cliente desistiu da compra / erro no registro"
            />
          </div>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>

        <footer className="pdv-modal-foot">
          <button className="outline pdv-back" type="button" onClick={onClose} disabled={processing}>
            Voltar
          </button>
          <button className="primary pdv-cancel-confirm" type="submit" disabled={!canSubmit}>
            {processing ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </footer>
      </form>
    </div>
  );
}
