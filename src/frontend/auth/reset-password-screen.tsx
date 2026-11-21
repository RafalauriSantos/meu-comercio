import type { FormEvent } from 'react';
import Link from 'next/link';
import { AuthShell } from './auth-shell';
import { FormError } from './form-error';
import { PasswordField } from './password-field';
import { passwordsMismatch } from './passwords-mismatch';
import { INVALID_LINK_MESSAGE } from './verify-email-link';
import type { ResetPhase } from './use-reset-password';

interface ResetPasswordScreenProps {
  phase: ResetPhase;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
}

/** The page of the password link: only draws each phase. The state is in use-reset-password.ts. */
export function ResetPasswordScreen({
  phase,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
  onRetry,
}: ResetPasswordScreenProps) {
  const mismatch = passwordsMismatch(password, confirm);
  const submitting = phase.name === 'submitting';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <AuthShell labelledBy="reset-title">
      <header className="auth-header">
        <h1 className="auth-title" id="reset-title">
          {phase.name === 'done' ? 'Senha alterada' : 'Redefinir senha'}
        </h1>
      </header>

      {phase.name === 'reading' && <p role="status">Verificando o link...</p>}

      {(phase.name === 'ready' || submitting) && (
        <>
          {phase.name === 'ready' && phase.error && <FormError message={phase.error} />}
          <form onSubmit={handleSubmit} className="auth-form">
            <PasswordField
              id="reset-password"
              label="Nova senha"
              value={password}
              onChange={onPasswordChange}
              autoComplete="new-password"
              minLength={8}
              placeholder="Mín. 8 caracteres"
            />
            <div>
              <PasswordField
                id="reset-confirm"
                label="Repita a senha"
                value={confirm}
                onChange={onConfirmChange}
                autoComplete="new-password"
                minLength={8}
                invalid={mismatch}
                describedBy={mismatch ? 'reset-confirm-msg' : undefined}
              />
              {mismatch && (
                <p className="auth-field-error" id="reset-confirm-msg">
                  As senhas não conferem.
                </p>
              )}
            </div>
            <button type="submit" className="primary auth-submit" disabled={submitting}>
              {submitting ? 'Redefinindo...' : 'Redefinir senha'}
            </button>
          </form>
        </>
      )}

      {phase.name === 'done' && (
        <>
          <p className="auth-subtitle" role="status">
            Senha alterada. Entre com a nova senha.
          </p>
          <Link href="/login" className="primary auth-submit">
            Ir para o login
          </Link>
        </>
      )}

      {phase.name === 'invalid' && (
        <>
          <FormError message={INVALID_LINK_MESSAGE} />
          <Link href="/esqueci-senha" className="primary auth-submit">
            Pedir novo link
          </Link>
        </>
      )}

      {(phase.name === 'limited' || phase.name === 'failed') && (
        <>
          <FormError message={phase.message} />
          <button type="button" className="primary auth-submit" onClick={onRetry}>
            Tentar de novo
          </button>
        </>
      )}
    </AuthShell>
  );
}
