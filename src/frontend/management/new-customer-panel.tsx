import React, { useId, useRef } from 'react';
import { maskPhone, phoneDigits, isStandardPhone } from '@/frontend/lib/phone-mask';
import { sanitizePin } from '@/frontend/auth/sanitize-pin';
import { noticeView } from '@/frontend/ui/notice-view';
import { maskLimit } from '@/frontend/management/customer-edit';
import {
  OPERATOR_LIMIT_NOTICE,
  canSaveNewCustomer,
  newLimitAboveZero,
  type NewCustomerDraft,
} from '@/frontend/management/new-customer';
import { useDialogPanel } from '@/frontend/lib/use-dialog-panel';

interface NewCustomerPanelProps {
  isOwner: boolean;
  draft: NewCustomerDraft;
  processing: boolean;
  closing: boolean;
  error: string | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onDraft: (change: Partial<NewCustomerDraft>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onClosed: () => void;
}

/** The form to register a customer, in a side panel (a modal <dialog>). It only draws: the rules are in new-customer.ts. */
export function NewCustomerPanel({
  isOwner,
  draft,
  processing,
  closing,
  error,
  nameRef,
  onDraft,
  onSubmit,
  onCancel,
  onClosed,
}: NewCustomerPanelProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogPanel(dialogRef, nameRef, closing, onClosed);
  const ready = canSaveNewCustomer(draft, isOwner);
  const phoneInvalid = phoneDigits(draft.phone).length >= 10 && !isStandardPhone(draft.phone);
  return (
    // Esc sends `cancel`: the app closes the panel (and its state) instead of the browser closing only the <dialog>.
    <dialog
      ref={dialogRef}
      className="mg-panel"
      aria-labelledby={`${id}-title`}
      data-closing={closing || undefined}
      inert={closing}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="mg-panel-head">
        <h2 id={`${id}-title`}>Novo cliente</h2>
        <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={onCancel}>
          ×
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="mg-panel-body">
          <div>
            <label className="field-label" htmlFor={`${id}-name`}>Nome</label>
            <input
              id={`${id}-name`}
              ref={nameRef}
              className="input"
              required
              value={draft.name}
              onChange={(e) => onDraft({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-phone`}>Telefone</label>
            <input
              id={`${id}-phone`}
              className="input num"
              type="tel"
              inputMode="tel"
              required
              aria-invalid={phoneInvalid || undefined}
              aria-describedby={`${id}-phone-help`}
              value={draft.phone}
              onChange={(e) => onDraft({ phone: maskPhone(e.target.value) })}
            />
            <span id={`${id}-phone-help`} className="mg-help">Com DDD, por exemplo (11) 99999-8888.</span>
            {phoneInvalid && (
              <div {...noticeView({ text: '', isError: true })}>
                Telefone inválido. Use DDD e 8 ou 9 dígitos, por exemplo (11) 99999-8888.
              </div>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-limit`}>Limite de fiado (R$)</label>
            {isOwner ? (
              <>
                <input
                  id={`${id}-limit`}
                  className="input num"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={draft.limit}
                  onChange={(e) => onDraft({ limit: maskLimit(e.target.value, draft.limit) })}
                />
                <span className="mg-help">O limite vai até R$ 500,00. Pode ficar em branco (R$ 0,00).</span>
              </>
            ) : (
              <>
                <input id={`${id}-limit`} className="input num" type="text" value="0,00" disabled />
                <span className="mg-help mg-help-warn">{OPERATOR_LIMIT_NOTICE}</span>
              </>
            )}
          </div>
          {newLimitAboveZero(draft, isOwner) && (
            <div>
              <label className="field-label" htmlFor={`${id}-pin`}>PIN da proprietária</label>
              <input
                id={`${id}-pin`}
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
          {error && <div {...noticeView({ text: error, isError: true })}>{error}</div>}
        </div>
        <div className="mg-panel-foot">
          {!ready && (
            <div className="mg-panel-hint">
              {canSaveNewCustomer({ ...draft, limit: '' }, isOwner)
                ? 'Digite o PIN da proprietária, com 6 dígitos, para salvar.'
                : 'Preencha o nome e o telefone para salvar.'}
            </div>
          )}
          <div className="mg-panel-actions">
            <button className="outline" type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={processing || !ready}>
              {processing ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
