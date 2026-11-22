import React, { useEffect, useId, useRef } from 'react';
import { noticeView } from '@/frontend/ui/notice-view';
import { returnFocusTo } from '@/frontend/lib/use-dialog-panel';
import {
  CONFIRM_TEXT,
  DELETE_HELP,
  DELETE_HISTORY_NOTE,
  PIN_HELP,
  isPinComplete,
  type DeleteError,
  type Kind,
} from '@/frontend/management/deactivate';
import { ForgotPinLink } from '@/frontend/auth/forgot-pin-link';

/** What an edit panel needs to draw the Excluir area and its confirmation (the hook owns the state). */
export interface DeleteFlowView {
  asking: boolean;
  pin: string;
  error: DeleteError | null;
  onAsk: () => void;
  onCancel: () => void;
  onPin: (value: string) => void;
  onConfirm: () => void;
  onReload: () => void;
}

const WORD: Record<Kind, string> = { product: 'produto', customer: 'cliente' };

interface DeleteAreaProps {
  kind: Kind;
  /** Why it cannot be excluded now (a customer with a debt, or a balance not loaded). Null means it can. */
  blockText: string | null;
  disabled: boolean;
  onAsk: () => void;
}

/** The end of an edit panel: help text and the red "Excluir ..." button (locked, with the reason, when it cannot). */
export function DeleteArea({ kind, blockText, disabled, onAsk }: DeleteAreaProps) {
  const helpId = useId();
  return (
    <div className="mg-delete">
      <h3>Excluir {WORD[kind]}</h3>
      {blockText ? (
        <span className="mg-help mg-help-warn" id={helpId} role="status">{blockText}</span>
      ) : (
        <span className="mg-help" id={helpId}>{DELETE_HELP[kind]}</span>
      )}
      <button
        type="button"
        className="outline mg-danger"
        aria-haspopup="dialog"
        aria-describedby={helpId}
        disabled={disabled || blockText !== null}
        onClick={onAsk}
      >
        Excluir {WORD[kind]}
      </button>
    </div>
  );
}

interface DeleteConfirmDialogProps {
  kind: Kind;
  name: string;
  /** The extra warning about the stock of a product, or null. */
  stockWarning: string | null;
  pin: string;
  error: DeleteError | null;
  processing: boolean;
  onPin: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onReload: () => void;
}

/** "Excluir <nome>?" as a modal alert dialog: the focus starts on Cancelar and Esc cancels. A customer also needs the owner's PIN. */
export function DeleteConfirmDialog({
  kind,
  name,
  stockWarning,
  pin,
  error,
  processing,
  onPin,
  onCancel,
  onConfirm,
  onReload,
}: DeleteConfirmDialogProps) {
  const titleId = useId();
  const textId = useId();
  const pinId = useId();
  const pinHelpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const needPin = kind === 'customer';
  const canConfirm = !processing && (!needPin || isPinComplete(pin));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => returnFocusTo(opener);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="mg-confirm"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(e) => {
        e.preventDefault();
        if (!processing) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canConfirm) onConfirm();
        }}
      >
        <h2 id={titleId}>Excluir {name}?</h2>
        <p id={textId}>{CONFIRM_TEXT[kind]}</p>
        {stockWarning && (
          <span className="mg-help mg-help-warn" role="status">{stockWarning}</span>
        )}
        <p className="muted">{DELETE_HISTORY_NOTE}</p>
        {needPin && (
          <div>
            <label className="field-label" htmlFor={pinId}>PIN da proprietária</label>
            <input
              id={pinId}
              className="input num mg-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              aria-describedby={pinHelpId}
              value={pin}
              onChange={(e) => onPin(e.target.value)}
            />
            <span className="mg-help" id={pinHelpId}>{PIN_HELP}</span>
            <ForgotPinLink />
          </div>
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
        <div className="mg-dialog-actions">
          <button ref={cancelRef} type="button" className="outline" disabled={processing} onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary mg-danger-fill" disabled={!canConfirm}>
            {processing ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
