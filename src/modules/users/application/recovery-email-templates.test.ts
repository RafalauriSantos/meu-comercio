import { describe, it, expect } from 'vitest';
import { emailChangedNotice, passwordChangedNotice, passwordResetEmail, pinChangedNotice, pinResetEmail, verificationEmail } from './recovery-email-templates';

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

describe('passwordResetEmail (AC-16, AC-67)', () => {
  const RESET_LINK = 'https://meucomercio.vercel.app/redefinir-senha#token=EXEMPLO';
  const mail = passwordResetEmail(RESET_LINK, WHEN, 'Mercearia da Maria');

  it('assunto fixo começando pelo nome do sistema', () => {
    expect(mail.subject).toBe('Meu Comércio: redefinir sua senha');
  });

  it('texto puro: loja, link, 30 minutos, hora de Brasília e "ignore"', () => {
    expect(mail.text).toContain('Mercearia da Maria');
    expect(mail.text).toContain(RESET_LINK);
    expect(mail.text).toContain('O link vale 30 minutos.');
    expect(mail.text).toContain('21/11/2026');
    expect(mail.text).toContain('Se não foi você, ignore este e-mail: sua senha não muda.');
  });

  it('HTML: loja, botão com o link, validade, data e rodapé; sem imagem, script nem outro http', () => {
    expect(mail.html).toContain('lang="pt-BR"');
    expect(mail.html).toContain('Mercearia da Maria');
    expect(mail.html).toContain(`href="${RESET_LINK}"`);
    expect(mail.html).toContain('Redefinir senha');
    expect(mail.html).toContain('O link vale 30 minutos');
    expect(mail.html).toContain('21/11/2026');
    expect(mail.html).toContain('Se não foi você, ignore este e-mail: sua senha não muda.');
    expect(mail.html).not.toMatch(/<img|<script/i);
    expect(mail.html.replaceAll(RESET_LINK, '')).not.toMatch(/https?:\/\//);
  });

  it('escapa o nome da loja e só aceita link http(s)', () => {
    const { html, text } = passwordResetEmail(RESET_LINK, WHEN, '<script>alert("x")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('<script>');
    expect(() => passwordResetEmail('javascript:alert(1)', WHEN, 'Loja')).toThrow();
  });
});

describe('passwordChangedNotice (AC-44)', () => {
  const mail = passwordChangedNotice(WHEN);

  it('assunto fixo, o que mudou, hora de Brasília e orientação', () => {
    expect(mail.subject).toBe('Meu Comércio: sua senha foi alterada');
    expect(mail.text).toContain('senha');
    expect(mail.text).toContain('21/11/2026');
    expect(mail.text).toContain('Não foi você? Entre em contato e troque sua senha de e-mail.');
    expect(mail.html).toContain('lang="pt-BR"');
    expect(mail.html).toContain('21/11/2026');
    expect(mail.html).toContain('Não foi você? Entre em contato e troque sua senha de e-mail.');
  });

  it('sem link, botão, imagem, script nem token', () => {
    expect(mail.html).not.toMatch(/<img|<script|<a |http|token/i);
    expect(mail.text).not.toMatch(/http|token/i);
  });
});

describe('pinResetEmail (AC-27, AC-67)', () => {
  const PIN_LINK = 'https://meucomercio.vercel.app/redefinir-pin#token=EXEMPLO';
  const mail = pinResetEmail(PIN_LINK, WHEN, 'Mercearia da Maria');

  it('assunto fixo e texto puro: loja, "redefinir o PIN", link, 30 minutos, hora de Brasília e "ignore"', () => {
    expect(mail.subject).toBe('Meu Comércio: redefinir seu PIN e sua senha');
    expect(mail.text).toContain('Mercearia da Maria');
    expect(mail.text).toContain('link para redefinir o PIN');
    expect(mail.text).toContain(PIN_LINK);
    expect(mail.text).toContain('O link vale 30 minutos.');
    expect(mail.text).toContain('21/11/2026');
    expect(mail.text).toContain('Se não foi você, ignore este e-mail: seu PIN e sua senha não mudam.');
  });

  it('HTML: botão com o link, validade, data e rodapé; sem imagem, script nem outro http', () => {
    expect(mail.html).toContain('lang="pt-BR"');
    expect(mail.html).toContain(`href="${PIN_LINK}"`);
    expect(mail.html).toContain('Redefinir PIN e senha');
    expect(mail.html).toContain('O link vale 30 minutos');
    expect(mail.html).toContain('21/11/2026');
    expect(mail.html).toContain('Se não foi você, ignore este e-mail: seu PIN e sua senha não mudam.');
    expect(mail.html).not.toMatch(/<img|<script/i);
    expect(mail.html.replaceAll(PIN_LINK, '')).not.toMatch(/https?:\/\//);
  });

  it('escapa o nome da loja e só aceita link http(s)', () => {
    const { html } = pinResetEmail(PIN_LINK, WHEN, '<script>alert("x")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(() => pinResetEmail('javascript:alert(1)', WHEN, 'Loja')).toThrow();
  });
});

describe('pinChangedNotice (AC-44)', () => {
  const mail = pinChangedNotice(WHEN);

  it('assunto fixo, "senha e PIN", hora de Brasília e orientação', () => {
    expect(mail.subject).toBe('Meu Comércio: sua senha e seu PIN foram alterados');
    expect(mail.text).toContain('senha e o PIN');
    expect(mail.text).toContain('21/11/2026');
    expect(mail.html).toContain('lang="pt-BR"');
    expect(mail.html).toContain('21/11/2026');
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('Não foi você? Entre em contato e troque sua senha de e-mail.');
    }
  });

  it('sem link, botão, imagem, script nem token', () => {
    expect(mail.html).not.toMatch(/<img|<script|<a |http|token/i);
    expect(mail.text).not.toMatch(/http|token/i);
  });
});
