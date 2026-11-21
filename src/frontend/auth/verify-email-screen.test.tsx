import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerifyEmailScreen } from './verify-email-screen';
import type { VerifyPhase } from './use-verify-email';

function render(phase: VerifyPhase) {
  return renderToStaticMarkup(<VerifyEmailScreen phase={phase} onConfirm={vi.fn()} onRetry={vi.fn()} />);
}
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('VerifyEmailScreen', () => {
  it('AC-3: link lido mostra o e-mail e o botão; um só h1', () => {
    const markup = render({ name: 'ready', email: 'maria@gmail.com' });

    expect(count(markup, '<h1')).toBe(1);
    expect(markup).toContain('Confirmar o e-mail <strong>maria@gmail.com</strong>?');
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Confirmar e-mail<\/button>/);
    expect(markup).not.toContain('role="alert"');
  });

  it('enquanto confirma o botão fica desativado', () => {
    const markup = render({ name: 'confirming', email: 'maria@gmail.com' });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Confirmando/);
  });

  it('AC-4: depois de confirmar mostra "E-mail confirmado" e o caminho para o sistema', () => {
    const markup = render({ name: 'done', email: 'maria@gmail.com' });

    expect(markup).toContain('E-mail confirmado');
    expect(markup).toMatch(/<a[^>]*href="\/gestao"[^>]*>Ir para o sistema<\/a>/);
    expect(markup).not.toContain('Confirmar e-mail</button>');
  });

  it('AC-22/35: link recusado mostra sempre a mesma mensagem, sem botão de confirmar', () => {
    const markup = render({ name: 'invalid' });

    expect(markup).toMatch(/role="alert"[^>]*>[\s\S]*Link inválido ou vencido\. Peça um novo\./);
    expect(markup).not.toContain('Confirmar e-mail</button>');
  });

  it('AC-5: e-mail em uso', () => {
    expect(render({ name: 'in-use' })).toContain('Este e-mail já está em uso');
  });

  it('AC-41: limite mostra a mensagem do servidor e não a de link inválido', () => {
    const markup = render({ name: 'limited', message: 'Aguarde 50 minutos para tentar de novo.' });

    expect(markup).toContain('Aguarde 50 minutos para tentar de novo.');
    expect(markup).not.toContain('Link inválido');
  });

  it('sem rede: mensagem do cliente e botão "Tentar de novo", nunca "link inválido"', () => {
    const markup = render({ name: 'failed', message: 'Sem conexão com a internet. Confira a conexão e tente de novo.' });

    expect(markup).toContain('Sem conexão com a internet.');
    expect(markup).toMatch(/<button[^>]*>Tentar de novo<\/button>/);
    expect(markup).not.toContain('Link inválido');
  });

  it('falha ao confirmar: o botão continua e o aviso aparece', () => {
    const markup = render({ name: 'ready', email: 'maria@gmail.com', error: 'A conexão está lenta. Tente de novo.' });

    expect(markup).toContain('A conexão está lenta. Tente de novo.');
    expect(markup).toContain('Confirmar e-mail</button>');
  });
});

describe('página /verificar-email (código)', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
  const files = {
    page: read('src', 'app', 'verificar-email', 'page.tsx'),
    hook: read('src', 'frontend', 'auth', 'use-verify-email.ts'),
    link: read('src', 'frontend', 'auth', 'verify-email-link.ts'),
    screen: read('src', 'frontend', 'auth', 'verify-email-screen.tsx'),
  };

  it('AC-36: apaga o fragmento e o token nunca vai a console, storage ou query', () => {
    expect(files.hook).toContain('history.replaceState(null');
    for (const [name, text] of Object.entries(files)) {
      for (const forbidden of ['console.', 'localStorage', 'sessionStorage', 'location.search', 'useSearchParams']) {
        expect(text, `${name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('AC-3: o confirm só é ligado ao clique do botão, nunca a um efeito', () => {
    expect(count(files.hook, 'confirmEmailVerification(')).toBe(1);
    const effect = files.hook.slice(files.hook.indexOf('useEffect('), files.hook.indexOf('}, [inspect]);'));
    expect(effect.length).toBeGreaterThan(50); // not vacuous: the effect was found
    expect(effect).not.toContain('confirm');
    expect(files.screen).toContain('onClick={onConfirm}');
  });

  it('a página é fina: só liga o hook ao componente', () => {
    expect(files.page).toContain('useVerifyEmail()');
    expect(files.page).toContain('<VerifyEmailScreen');
    expect(files.page.split('\n').length).toBeLessThan(25);
  });
});
