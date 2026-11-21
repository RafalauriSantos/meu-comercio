import type { FormEvent } from 'react';
import Link from 'next/link';
import { AuthShell } from './auth-shell';
import { FormError } from './form-error';
import {
  FORGOT_CONFIRMED_ONLY,
  FORGOT_NEUTRAL_MESSAGE,
  FORGOT_OPERATOR_NOTE,
  FORGOT_SPAM_HELP,
} from './forgot-password-view';
import type { ForgotPhase } from './use-forgot-password';

interface ForgotPasswordScreenProps {
  phase: ForgotPhase;
  email: string;
  honeypot: string;
  seconds: number;
  onEmailChange: (value: string) => void;
  onHoneypotChange: (value: string) => void;
  onSubmit: () => void;
}

/** The page of the password reset request: only draws each phase. The state is in use-forgot-password.ts. */
export function ForgotPasswordScreen({
  phase,
  email,
  honeypot,
  seconds,
  onEmailChange,
  onHoneypotChange,
  onSubmit,
}: ForgotPasswordScreenProps) {
  const sending = phase.name === 'sending';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  if (phase.name === 'sent') {
    return (
      <AuthShell labelledBy="forgot-title">
        <header className="auth-header">
          <h1 className="auth-title" id="forgot-title">
            Link enviado
          </h1>
        </header>
        <p role="status">{FORGOT_NEUTRAL_MESSAGE}</p>
        <p className="auth-hint">{FORGOT_SPAM_HELP}</p>
        <button type="button" className="primary auth-submit" onClick={onSubmit} disabled={seconds > 0}>
          {seconds > 0 ? `Pedir de novo (${seconds} s)` : 'Pedir de novo'}
        </button>
        <Link href="/login" className="auth-link">
          Voltar ao login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell labelledBy="forgot-title">
      <header className="auth-header">
        <h1 className="auth-title" id="forgot-title">
          Esqueci a senha
        </h1>
        <p className="auth-subtitle">Informe o e-mail da proprietária para receber um link.</p>
      </header>

      {phase.name === 'form' && phase.error && <FormError message={phase.error} />}

      <form onSubmit={handleSubmit} className="auth-form">
        <div style={{ display: 'none', position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <label htmlFor="forgot-website">Website</label>
          <input
            id="forgot-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => onHoneypotChange(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="forgot-email">
            E-mail
          </label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            aria-describedby="forgot-email-hint"
          />
          <p className="auth-hint" id="forgot-email-hint">
            {FORGOT_CONFIRMED_ONLY}
          </p>
        </div>

        <button className="primary auth-submit" type="submit" disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>

      <p className="auth-hint">{FORGOT_OPERATOR_NOTE}</p>
      <Link href="/login" className="auth-link">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
