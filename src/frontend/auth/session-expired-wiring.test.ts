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

  it('the PDV syncs the offline queue when it loads with the logged user (also after coming back from the login)', () => {
    const pdv = read('src', 'app', 'pdv', 'page.tsx');
    expect(pdv).toMatch(/useEffect\(\(\) => \{\s*if \(user\) void triggerOfflineSync\(\);\s*\}, \[user\]\)/);
    expect(pdv).not.toMatch(/useSessionExpired\([^)]*triggerOfflineSync/);
  });

  it('the PDV saves the cart before leaving and takes it back when the same person loads the PDV', () => {
    const pdv = read('src', 'app', 'pdv', 'page.tsx');
    expect(pdv).toMatch(/useSessionExpired\(saveCartBeforeLogin\)/);
    expect(pdv).toContain('saveCartDraft(');
    expect(pdv).toContain('takeCartDraft(');
    expect(pdv).toContain('checkoutKeys.current.adopt(');
    expect(pdv).toContain('checkoutKeys.current.peek()');
  });

  it('the notice stays on screen (no auto dismiss) and has one button, Entrar agora', () => {
    const notice = read('src', 'frontend', 'auth', 'session-expired-notice.tsx');
    expect(notice).not.toContain('useAutoDismiss');
    expect(notice).toContain('Sua sessão expirou. Você será levada ao login.');
    expect(notice).toContain('Entrar agora');
    expect(notice).not.toContain('Entrar de novo');
    expect(notice).not.toContain('Já entrei');
  });

  it('the hook goes to the login in the same tab with voltar, once, after a delay or on the button', () => {
    const hook = read('src', 'frontend', 'auth', 'use-session-expired.ts');
    expect(hook).toContain('loginUrlHere()');
    expect(hook).toContain('location.assign(');
    expect(hook).toContain('SESSION_REDIRECT_DELAY_MS');
    expect(hook).toContain('createOnce(');
    expect(hook).not.toContain('window.open');
    expect(hook).not.toContain('apiClient');
    expect(hook).not.toContain('confirmLogin');
  });

  it('the first load that fails with an expired session goes to the login with voltar, in the Gestão and in the PDV; any other failure stays on the screen', () => {
    for (const screen of ['gestao', 'pdv'] as const) {
      const source = readScreenSource(screen);
      expect(source).toMatch(
        /\} catch \(err\) \{\s*if \(shouldGoToLogin\(err\)\) router\.push\(loginUrlHere\(\)\);\s*else setInitError\(loadErrorMessage\(err\)\);\s*\} finally \{\s*setLoading\(false\);/
      );
    }
  });

  it('the login page only follows a safe voltar and clears the expired signal on a new login', () => {
    const login = read('src', 'app', 'login', 'page.tsx');
    expect(login).toContain("safeReturnPath(");
    expect(login).toContain("get('voltar')");
    expect(login).toContain('afterLoginPath(');
    expect(login).toContain('clearSessionExpired()');
  });
});
