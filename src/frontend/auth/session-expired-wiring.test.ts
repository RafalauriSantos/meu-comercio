import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScreenSource } from '@/test-utils/read-screen-source';

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), 'utf8');

describe('session expired notice wiring', () => {
  it('the Gestão and the PDV use the hook and show the notice', () => {
    for (const screen of ['gestao', 'pdv'] as const) {
      const source = readScreenSource(screen);
      expect(source).toContain('useSessionExpired(');
      expect(source).toContain('<SessionExpiredNotice');
    }
  });

  it('the PDV resumes the offline queue when the same person is back', () => {
    expect(read('src', 'app', 'pdv', 'page.tsx')).toMatch(/useSessionExpired\([^)]*triggerOfflineSync/);
  });

  it('the notice stays on screen: no auto dismiss, and it offers both buttons', () => {
    const notice = read('src', 'frontend', 'auth', 'session-expired-notice.tsx');
    expect(notice).not.toContain('useAutoDismiss');
    expect(notice).toContain('Sua sessão expirou');
    expect(notice).toContain('Entrar de novo');
    expect(notice).toContain('Já entrei');
  });

  it('the hook opens the login in another tab with voltar and revalidates with me()', () => {
    const hook = read('src', 'frontend', 'auth', 'use-session-expired.ts');
    expect(hook).toContain('loginUrlWithReturn(');
    expect(hook).toContain("'_blank'");
    expect(hook).toContain('apiClient.me()');
    expect(hook).toContain('isSameSession(');
    expect(hook).toContain('location.reload()');
  });

  it('the login page only follows a safe voltar and clears the expired signal on a new login', () => {
    const login = read('src', 'app', 'login', 'page.tsx');
    expect(login).toContain("safeReturnPath(");
    expect(login).toContain("get('voltar')");
    expect(login).toContain('afterLoginPath(');
    expect(login).toContain('clearSessionExpired()');
  });
});
