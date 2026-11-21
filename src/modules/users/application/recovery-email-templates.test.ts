import { describe, it, expect } from 'vitest';
import { emailChangedNotice, verificationEmail } from './recovery-email-templates';

const LINK = 'https://meucomercio.vercel.app/verificar-email#token=EXEMPLO';
const WHEN = new Date('2026-11-21T15:30:00Z');

describe('verificationEmail', () => {
  const mail = verificationEmail(LINK, WHEN);

  it('mantém o assunto fixo, começando pelo nome do sistema', () => {
    expect(mail.subject).toBe('Meu Comércio: confirme seu e-mail');
  });

  it('o texto puro continua com o link e o aviso de validade', () => {
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('O link vale 30 minutos.');
  });

  it('o HTML tem o link (botão e texto), o texto do botão, lang pt-BR, data de Brasília e o rodapé', () => {
    expect(mail.html).toContain('lang="pt-BR"');
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain('Confirmar e-mail');
    expect(mail.html).toContain('O link vale 30 minutos');
    expect(mail.html).toContain('21/11/2026');
    expect(mail.html).toContain('Se não foi você, ignore este e-mail: nada muda.');
  });

  it('o HTML não tem imagem, script nem http:// que não seja o do link recebido', () => {
    expect(mail.html).not.toMatch(/<img/i);
    expect(mail.html).not.toMatch(/<script/i);
    expect(mail.html.replaceAll(LINK, '')).not.toMatch(/https?:\/\//);
  });

  it('escapa entrada hostil no link', () => {
    const hostile = 'https://exemplo.com/"><script>alert(1)</script>&x="1';
    const html = verificationEmail(hostile, WHEN).html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"><script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&amp;x=');
  });

  it('só aceita link http(s)', () => {
    expect(() => verificationEmail('javascript:alert(1)', WHEN)).toThrow();
    expect(() => verificationEmail('data:text/html,<b>x</b>', WHEN)).toThrow();
  });
});

describe('emailChangedNotice', () => {
  it('mantém o assunto fixo e o texto puro', () => {
    const mail = emailChangedNotice('d***@gmail.com', WHEN);
    expect(mail.subject).toBe('Meu Comércio: seu e-mail de recuperação foi alterado');
    expect(mail.text).toContain('d***@gmail.com');
  });

  it('o HTML mostra o e-mail mascarado e a data, sem botão, imagem, script nem link', () => {
    const { html } = emailChangedNotice('d***@gmail.com', WHEN);
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('d***@gmail.com');
    expect(html).toContain('21/11/2026');
    expect(html).not.toMatch(/<img|<script|<a |http/i);
  });

  it('escapa entrada hostil no e-mail mascarado', () => {
    const { html } = emailChangedNotice('<script>alert("x")</script>', WHEN);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;x&quot;');
  });
});
