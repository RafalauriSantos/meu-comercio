import { noticeView } from '@/frontend/ui/notice-view';
import type { useSessionExpired } from './use-session-expired';

/** Stays until the person is taken to the login (no dismiss). */
export function SessionExpiredNotice({ session }: { session: ReturnType<typeof useSessionExpired> }) {
  if (!session.expired) return null;
  const text = 'Sua sessão expirou. Você será levada ao login.';
  return (
    <div {...noticeView({ text, isError: true })}>
      <span>{text}</span>
      <button type="button" className="soft" onClick={session.enterNow}>
        Entrar agora
      </button>
    </div>
  );
}
