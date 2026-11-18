import React, { useId, useRef } from 'react';
import type { CustomerItem } from '@/frontend/lib/api-client';
import { maskPhone, isStandardPhone } from '@/frontend/lib/phone-mask';
import { formatMoney } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import { noticeView } from '@/frontend/ui/notice-view';
import {
  LIMIT_BELOW_DEBT_WARNING,
  buildCustomerPatch,
  isDraftValid,
  limitBelowDebt,
  limitRaised,
  maskLimit,
  type CustomerDraft,
  type CustomerEditError,
} from '@/frontend/management/customer-edit';
import { sanitizePin } from '@/frontend/auth/sanitize-pin';
import { useDialogPanel } from '@/frontend/lib/use-dialog-panel';

interface CustomerEditPanelProps {
  target: CustomerItem;
  draft: CustomerDraft;
  /** The current debt in cents; null while the balance has not arrived. */
  debtCents: number | null;
  processing: boolean;
  closing: boolean;
  error: CustomerEditError | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onDraft: (change: Partial<CustomerDraft>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onClosed: () => void;
  onReload: () => void;
}

/** The edit form of one customer, in a side panel (a modal <dialog>). It only draws: the rules are in customer-edit.ts. */
export function CustomerEditPanel({
  target,
  draft,
  debtCents,
  processing,
  closing,
  error,
  nameRef,
  onDraft,
  onSubmit,
  onCancel,
  onClosed,
  onReload,
}: CustomerEditPanelProps) {
  const id = target.id;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogPanel(dialogRef, nameRef, closing, onClosed);
  const unchanged = buildCustomerPatch(target, draft) === null;
  const needsPin = limitRaised(target, draft);
  const cannotSave = processing || !isDraftValid(draft) || unchanged || (needsPin && draft.ownerPin.length !== 6);
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
        <h2 id={titleId}>Editar cliente</h2>
        <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={onCancel}>
          ×
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="mg-panel-body">
          <div>
            <label className="field-label" htmlFor={`edit-cname-${id}`}>Nome</label>
            <input
              id={`edit-cname-${id}`}
              ref={nameRef}
              className="input"
              required
              value={draft.name}
              onChange={(e) => onDraft({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`edit-cphone-${id}`}>Telefone / WhatsApp</label>
            <input
              id={`edit-cphone-${id}`}
              className="input num"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => onDraft({ phone: maskPhone(e.target.value) })}
            />
            {draft.phone.trim() !== '' && !isStandardPhone(draft.phone) && (
              <span className="mg-badge mg-badge-near">Telefone fora do padrão</span>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor={`edit-climit-${id}`}>Limite de fiado (R$)</label>
            <input
              id={`edit-climit-${id}`}
              className="input num"
              type="text"
              inputMode="numeric"
              value={draft.limit}
              onChange={(e) => onDraft({ limit: maskLimit(e.target.value, draft.limit) })}
            />
            <span className="mg-help">
              {debtCents !== null && <>Dívida atual: {formatMoney(Money.fromCents(debtCents))}. </>}
              O limite vai até R$ 500,00.
            </span>
            {limitBelowDebt(draft.limit, debtCents) && (
              <span className="mg-help mg-help-warn" role="status">
                {LIMIT_BELOW_DEBT_WARNING}
              </span>
            )}
          </div>
          {needsPin && (
            <div>
              <label className="field-label" htmlFor={`edit-cpin-${id}`}>PIN da proprietária</label>
              <input
                id={`edit-cpin-${id}`}
                className="input num"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={draft.ownerPin}
                onChange={(e) => onDraft({ ownerPin: sanitizePin(e.target.value) })}
              />
              <span className="mg-help">Por segurança, aumentar o limite pede o seu PIN.</span>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor={`edit-cblocked-${id}`}>Fiado bloqueado</label>
            <input
              id={`edit-cblocked-${id}`}
              type="checkbox"
              role="switch"
              checked={draft.creditBlocked}
              onChange={(e) => onDraft({ creditBlocked: e.target.checked })}
            />
            <span className="mg-help">
              O cliente continua comprando à vista e pode pagar o que deve. Só o fiado fica barrado.
            </span>
          </div>
          {error && (
            <div {...noticeView({ text: error.text, isError: true })}>
              {error.text}
              {error.reload && (
                <button type="button" className="outline" onClick={onReload}>
                  Recarregar
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mg-panel-foot">
          {unchanged && <div className="mg-panel-hint">Altere algo para poder salvar.</div>}
          {!unchanged && needsPin && draft.ownerPin.length !== 6 && (
            <div className="mg-panel-hint">Digite o PIN da proprietária, com 6 dígitos, para salvar.</div>
          )}
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
