import { noticeView } from '@/frontend/ui/notice-view';
import type { useSessionExpired } from './use-session-expired';

/** Stays until the session is back (no auto dismiss). */
export function SessionExpiredNotice({ session }: { session: ReturnType<typeof useSessionExpired> }) {
  if (!session.expired) return null;
  const text = 'Sua sessão expirou. Entre de novo em outra aba: esta tela e o carrinho ficam como estão.';
  return (
    <div {...noticeView({ text, isError: true })}>
      <span>
        {text}
        {session.error && ` ${session.error}`}
      </span>
      <button type="button" className="soft" onClick={session.reenter}>
        Entrar de novo
      </button>
      <button type="button" className="soft" disabled={session.checking} onClick={session.confirmLogin}>
        {session.checking ? 'Conferindo…' : 'Já entrei'}
      </button>
    </div>
  );
}
