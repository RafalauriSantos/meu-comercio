import Link from 'next/link';
import { AuthShell } from './auth-shell';
import { FormError } from './form-error';
import { INVALID_LINK_MESSAGE } from './verify-email-link';
import type { VerifyPhase } from './use-verify-email';

interface VerifyEmailScreenProps {
  phase: VerifyPhase;
  onConfirm: () => void;
  onRetry: () => void;
}

// What each refused or failed phase says. Any refused link says the same thing (AC-22, AC-35).
function failureMessage(phase: VerifyPhase): string | null {
  if (phase.name === 'invalid') return INVALID_LINK_MESSAGE;
  if (phase.name === 'in-use') return 'Este e-mail já está em uso';
  if (phase.name === 'limited' || phase.name === 'failed') return phase.message;
  return null;
}

/** The page of the e-mail link: only draws each phase. The state is in use-verify-email.ts. */
export function VerifyEmailScreen({ phase, onConfirm, onRetry }: VerifyEmailScreenProps) {
  const failure = failureMessage(phase);
  const done = phase.name === 'done';

  return (
    <AuthShell labelledBy="verify-title">
      <header className="auth-header">
        <h1 className="auth-title" id="verify-title">
          {done ? 'E-mail confirmado' : 'Confirmar e-mail'}
        </h1>
      </header>

      {phase.name === 'reading' && <p role="status">Verificando o link...</p>}

      {(phase.name === 'ready' || phase.name === 'confirming') && (
        <>
          {phase.name === 'ready' && phase.error && <FormError message={phase.error} />}
          <p className="auth-subtitle">
            Confirmar o e-mail <strong>{phase.email}</strong>?
          </p>
          <button type="button" className="primary auth-submit" onClick={onConfirm} disabled={phase.name === 'confirming'}>
            {phase.name === 'confirming' ? 'Confirmando...' : 'Confirmar e-mail'}
          </button>
        </>
      )}

      {done && (
        <>
          <p className="auth-subtitle">
            O e-mail <strong>{phase.email}</strong> foi confirmado.
          </p>
          <Link href="/gestao" className="primary auth-submit">
            Ir para o sistema
          </Link>
        </>
      )}

      {failure && <FormError message={failure} />}
      {phase.name === 'failed' && (
        <button type="button" className="primary auth-submit" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
      {failure && phase.name !== 'failed' && (
        <Link href="/gestao" className="auth-link">
          Ir para o sistema
        </Link>
      )}
    </AuthShell>
  );
}
