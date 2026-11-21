import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResetPasswordScreen } from './reset-password-screen';
import type { ResetPhase } from './use-reset-password';

function render(phase: ResetPhase, confirm = '') {
  return renderToStaticMarkup(
    <ResetPasswordScreen
      phase={phase}
      password="senha-nova-1"
      confirm={confirm}
      onPasswordChange={vi.fn()}
      onConfirmChange={vi.fn()}
      onSubmit={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('ResetPasswordScreen', () => {
  it('AC-18: link lido mostra os dois campos, novos, com mínimo de 8 e mostrar/ocultar', () => {
    const markup = render({ name: 'ready' });

    expect(markup.split('<h1').length - 1).toBe(1);
    expect(markup).toMatch(/<label[^>]*for="reset-password"[^>]*>Nova senha<\/label>/);
    expect(markup).toMatch(/<label[^>]*for="reset-confirm"[^>]*>Repita a senha<\/label>/);
    expect(markup.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(markup.match(/minLength="8"/g)).toHaveLength(2);
    expect(markup).toContain('Mostrar senha');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Redefinir senha<\/button>/);
    expect(markup).not.toContain('role="alert"');
  });

  it('AC-20: erro de campo aparece e o formulário continua', () => {
    const markup = render({ name: 'ready', error: 'A nova senha deve ser diferente da atual.' });

    expect(markup).toContain('A nova senha deve ser diferente da atual.');
    expect(markup).toContain('Redefinir senha</button>');
  });

  it('AC-20: avisa já na tela que a repetição difere', () => {
    expect(render({ name: 'ready' }, 'senha-nova-X')).toContain('As senhas não conferem.');
  });

  it('enquanto envia o botão fica desativado', () => {
    expect(render({ name: 'submitting' })).toMatch(/<button[^>]*disabled=""[^>]*>Redefinindo/);
  });

  it('AC-19: sucesso com o texto exato e botão para /login sem query', () => {
    const markup = render({ name: 'done' });

    expect(markup).toContain('Senha alterada. Entre com a nova senha.');
    expect(markup).toMatch(/<a[^>]*href="\/login"[^>]*>Ir para o login<\/a>/);
    expect(markup).not.toContain('type="password"');
  });

  it('AC-22/35: link recusado mostra sempre a mesma mensagem e leva a /esqueci-senha', () => {
    const markup = render({ name: 'invalid' });

    expect(markup).toMatch(/role="alert"[^>]*>[\s\S]*Link inválido ou vencido\. Peça um novo\./);
    expect(markup).toMatch(/<a[^>]*href="\/esqueci-senha"[^>]*>/);
    expect(markup).not.toContain('type="password"');
  });

  it('AC-41: limite mostra a mensagem do servidor e não a de link inválido', () => {
    const markup = render({ name: 'limited', message: 'Aguarde 50 minutos para tentar de novo.' });

    expect(markup).toContain('Aguarde 50 minutos para tentar de novo.');
    expect(markup).toMatch(/<button[^>]*>Tentar de novo<\/button>/);
    expect(markup).not.toContain('Link inválido');
  });

  it('falha de rede na consulta: "Tentar de novo", nunca link inválido', () => {
    const markup = render({ name: 'failed', message: 'Sem conexão com a internet.' });

    expect(markup).toContain('Sem conexão com a internet.');
    expect(markup).toMatch(/<button[^>]*>Tentar de novo<\/button>/);
    expect(markup).not.toContain('Link inválido');
  });
});

describe('página /redefinir-senha (código)', () => {
  const files = {
    page: read('src', 'app', 'redefinir-senha', 'page.tsx'),
    layout: read('src', 'app', 'redefinir-senha', 'layout.tsx'),
    hook: read('src', 'frontend', 'auth', 'use-reset-password.ts'),
    screen: read('src', 'frontend', 'auth', 'reset-password-screen.tsx'),
  };

  it('AC-36: noindex e sem Referer; apaga o fragmento; nada de console, storage ou query', () => {
    expect(files.layout).toContain('index: false');
    expect(files.layout).toContain("referrer: 'no-referrer'");
    expect(files.hook).toContain('history.replaceState(null');
    for (const [name, text] of Object.entries(files)) {
      for (const forbidden of ['console.', 'localStorage', 'sessionStorage', 'location.search', 'useSearchParams']) {
        expect(text, `${name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('AC-18: o confirm só é ligado ao envio do formulário, nunca a um efeito', () => {
    expect(files.hook.split('confirmPasswordReset(').length - 1).toBe(1);
    const effect = files.hook.slice(files.hook.indexOf('useEffect('), files.hook.indexOf('}, [inspect]);'));
    expect(effect.length).toBeGreaterThan(50);
    expect(effect).not.toContain('submit');
    expect(files.screen).toContain('<form onSubmit={handleSubmit}');
  });

  it('a página é fina', () => {
    expect(files.page).toContain('useResetPassword()');
    expect(files.page).toContain('<ResetPasswordScreen');
    expect(files.page.split('\n').length).toBeLessThan(30);
  });
});
