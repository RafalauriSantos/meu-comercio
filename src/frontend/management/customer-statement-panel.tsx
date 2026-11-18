import React, { useId, useRef } from 'react';
import { formatMoney } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import type { StatementItem } from '@/frontend/lib/api-client';
import { noticeView } from '@/frontend/ui/notice-view';
import { statementRow } from '@/frontend/management/customer-statement';
import { useDialogPanel } from '@/frontend/lib/use-dialog-panel';

interface CustomerStatementPanelProps {
  name: string;
  /** The current debt in cents; null while the balance has not arrived. */
  debtCents: number | null;
  items: StatementItem[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  closing: boolean;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onClosed: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

/** The statement of one customer, in a side panel (a modal <dialog>). It only draws: the rules are in customer-statement.ts. */
export function CustomerStatementPanel({
  name,
  debtCents,
  items,
  loading,
  hasMore,
  error,
  closing,
  closeRef,
  onClose,
  onClosed,
  onLoadMore,
  onRetry,
}: CustomerStatementPanelProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogPanel(dialogRef, closeRef, closing, onClosed);
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
        onClose();
      }}
    >
      <div className="mg-panel-head">
        <h2 id={titleId}>Extrato de {name}</h2>
        <button ref={closeRef} type="button" className="mg-dialog-close" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mg-panel-body">
        <p className="mg-stmt-balance num">
          Saldo atual: {debtCents === null ? '—' : formatMoney(Money.fromCents(debtCents))}
        </p>
        {items.length > 0 && (
          <ul className="mg-stmt-list">
            {items.map((item) => {
              const row = statementRow(item);
              return (
                <li key={row.id} className="mg-stmt-row">
                  <div className="mg-stmt-line">
                    <strong>{row.label}</strong>
                    <strong className={`num ${row.toneClass}`}>
                      {row.sign} {row.amount}
                    </strong>
                  </div>
                  <div className="mg-stmt-line muted num">
                    <span>{row.date}</span>
                    <span>Saldo: {row.balance}</span>
                  </div>
                  <div className="muted">{row.operator}</div>
                  {row.reason && <div className="muted">{row.reason}</div>}
                </li>
              );
            })}
          </ul>
        )}
        {loading && items.length === 0 && <p role="status">Carregando...</p>}
        {!loading && !error && items.length === 0 && <p className="muted">Este cliente ainda não tem movimentos.</p>}
        {error && (
          <div {...noticeView({ text: error, isError: true })}>
            {error}
            <button type="button" className="outline" onClick={onRetry} disabled={loading}>
              Tentar de novo
            </button>
          </div>
        )}
        {hasMore && !error && (
          <button type="button" className="outline" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Carregando...' : 'Carregar mais'}
          </button>
        )}
      </div>
    </dialog>
  );
}
