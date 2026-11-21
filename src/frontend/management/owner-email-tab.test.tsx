import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OwnerEmailTab } from './owner-email-tab';
import { OwnerEmailBanner } from './owner-email-banner';
import type { useOwnerEmailTab } from './use-owner-email-tab';

type Tab = ReturnType<typeof useOwnerEmailTab>;

function render(over: Partial<Tab> = {}, loadFailed: { ownerEmail?: boolean } = {}, processing = false) {
  const tab: Tab = {
    status: { email: null, verified: false },
    email: '',
    setEmail: vi.fn(),
    currentPassword: '',
    setCurrentPassword: vi.fn(),
    sentTo: null,
    error: null,
    seconds: 0,
    loadOwnerEmail: vi.fn(),
    handleSubmit: vi.fn(),
    handleResend: vi.fn(),
    ...over,
  };
  return renderToStaticMarkup(
    <OwnerEmailTab tab={tab} loadFailed={loadFailed} retrying={false} processing={processing} retry={vi.fn()} />
  );
}

describe('OwnerEmailTab', () => {
  it('AC-1: sem e-mail, o formulário pede o e-mail e a senha atual, com rótulos ligados aos campos', () => {
    const markup = render();

    expect(markup).toContain('Cadastrar e-mail');
    expect(markup).toMatch(/<label[^>]*for="owner-email"[^>]*>E-mail<\/label>/);
    expect(markup).toMatch(/<input[^>]*id="owner-email"/);
    expect(markup).toContain('type="email"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toMatch(/<label[^>]*for="owner-email-password"[^>]*>Senha atual<\/label>/);
    expect(markup).toMatch(/<input[^>]*id="owner-email-password"/);
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).not.toContain('Reenviar link');
  });

  it('AC-6: com e-mail, a troca pede o novo e-mail e a senha atual', () => {
    const markup = render({ status: { email: 'velho@gmail.com', verified: true } });

    expect(markup).toContain('Trocar e-mail');
    expect(markup).toMatch(/<label[^>]*for="owner-email"[^>]*>Novo e-mail<\/label>/);
    expect(markup).toContain('Senha atual</label>');
    expect(markup).toContain('velho@gmail.com');
    expect(markup).toContain('confirmado');
    expect(markup).not.toContain('Reenviar link'); // nothing to resend once confirmed
  });

  it('AC-63: e-mail não confirmado oferece o reenvio, sem pedir senha', () => {
    const markup = render({ status: { email: 'maria@gmail.com', verified: false } });

    expect(markup).toContain('falta confirmar');
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Reenviar link<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Reenviar link/);
  });

  it('AC-10/66: durante a espera o reenvio fica desativado e diz quantos segundos faltam', () => {
    const markup = render({ status: { email: 'maria@gmail.com', verified: false }, seconds: 42 });

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Reenviar link \(aguarde 42 segundos\)<\/button>/);
  });

  it('AC-1/66: depois do envio mostra o e-mail, a validade e a ajuda de spam', () => {
    const markup = render({ status: { email: 'maria@gmail.com', verified: false }, sentTo: 'maria@gmail.com', seconds: 60 });

    expect(markup).toContain('Enviamos um link para maria@gmail.com. Ele vale 30 minutos.');
    expect(markup).toContain('Olhe Spam e Promoções. Procure o remetente Meu Comércio.');
    expect(markup).toMatch(/role="status"[^>]*>[\s\S]*Enviamos um link/);
  });

  it('não mostra a mensagem de envio nem a ajuda antes de enviar', () => {
    const markup = render();
    expect(markup).not.toContain('Enviamos um link');
    expect(markup).not.toContain('Spam');
  });

  it('AC-2/6/48: um erro do servidor aparece como alerta', () => {
    const markup = render({ error: 'Senha atual incorreta.' });
    expect(markup).toMatch(/role="alert"[^>]*>[\s\S]*Senha atual incorreta\./);
  });

  it('AC-9: a leitura falhou: aviso com "Tentar de novo" e nenhum formulário (o estado é desconhecido)', () => {
    const markup = render({ status: null }, { ownerEmail: true });

    expect(markup).toContain('Não foi possível carregar o e-mail de recuperação.');
    expect(markup).toContain('Tentar de novo');
    expect(markup).not.toContain('<form');
  });

  it('com a operação em andamento o envio fica desativado', () => {
    expect(render({}, {}, true)).toMatch(/<button[^>]*disabled=""[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe('OwnerEmailBanner', () => {
  const banner = (status: Parameters<typeof OwnerEmailBanner>[0]['status']) =>
    renderToStaticMarkup(<OwnerEmailBanner status={status} onOpen={vi.fn()} />);

  it('AC-62: sem e-mail, o texto exato e o botão que leva ao cadastro', () => {
    const markup = banner({ email: null, verified: false });

    expect(markup).toContain('Cadastre e confirme seu e-mail para poder recuperar a senha e o PIN');
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Cadastrar e-mail<\/button>/);
  });

  it('AC-63: e-mail não confirmado, o texto exato e "Reenviar link"', () => {
    const markup = banner({ email: 'maria@gmail.com', verified: false });

    expect(markup).toContain('Falta confirmar seu e-mail');
    expect(markup).toContain('Reenviar link</button>');
  });

  it('AC-62/63: o aviso some só com o e-mail confirmado; sem estado conhecido também não aparece', () => {
    expect(banner({ email: 'maria@gmail.com', verified: true })).toBe('');
    expect(banner(null)).toBe('');
  });
});
