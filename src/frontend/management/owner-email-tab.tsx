'use client';

import React from 'react';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { noticeView } from '@/frontend/ui/notice-view';
import { resendLabel, sentMessage, SPAM_HELP } from './owner-email-view';
import type { useOwnerEmailTab } from './use-owner-email-tab';

interface OwnerEmailTabProps {
  tab: ReturnType<typeof useOwnerEmailTab>;
  loadFailed: { ownerEmail?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The recovery e-mail tab of the management panel (owner only: the page decides who sees it). */
export function OwnerEmailTab({ tab, loadFailed, retrying, processing, retry }: OwnerEmailTabProps) {
  const { status, email, setEmail, currentPassword, setCurrentPassword, sentTo, error, seconds, loadOwnerEmail, handleSubmit, handleResend } = tab;
  const hasEmail = Boolean(status?.email);

  return (
    <section className="mg-section">
      {loadFailed.ownerEmail && (
        <LoadFailureNotice what="o e-mail de recuperação" busy={retrying} onRetry={() => retry(loadOwnerEmail)} />
      )}
      <div className="mg-section-head">
        <div>
          <h2>E-mail de recuperação</h2>
          <p className="muted">Usado para recuperar a senha e o PIN. Só vale depois de confirmado pelo link que enviamos.</p>
        </div>
      </div>

      {status && (
        <div className="card mg-narrow">
          <p>
            {status.email
              ? <>E-mail <strong>{status.email}</strong>: {status.verified ? 'confirmado.' : 'falta confirmar.'}</>
              : 'Nenhum e-mail cadastrado.'}
          </p>

          {sentTo && (
            <div {...noticeView({ text: sentMessage(sentTo), isSuccess: true })}>
              <span>{sentMessage(sentTo)}</span>
            </div>
          )}
          {sentTo && <small className="mg-help">{SPAM_HELP}</small>}
          {error && (
            <div {...noticeView({ text: error, isError: true })}>
              <span>{error}</span>
            </div>
          )}

          {hasEmail && !status.verified && (
            <button type="button" className="outline" onClick={handleResend} disabled={processing || seconds > 0}>
              {resendLabel(seconds)}
            </button>
          )}
        </div>
      )}

      {status && (
        <form onSubmit={handleSubmit} className="card mg-narrow">
          <h3>{hasEmail ? 'Trocar e-mail' : 'Cadastrar e-mail'}</h3>
          <div className="mg-stack">
            <div>
              <label className="field-label" htmlFor="owner-email">{hasEmail ? 'Novo e-mail' : 'E-mail'}</label>
              <input
                id="owner-email"
                className="input"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="owner-email-password">Senha atual</label>
              <input
                id="owner-email-password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <small className="mg-help">Pedimos a senha para confirmar que é você.</small>
            </div>
          </div>
          <button className="primary mg-form-submit" type="submit" disabled={processing}>
            {processing ? 'Enviando...' : 'Enviar link de confirmação'}
          </button>
        </form>
      )}
    </section>
  );
}
