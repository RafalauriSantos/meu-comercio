// Multipart (AC-67): plain text plus HTML, both with no images, no tracking and no short links. The subject always
// starts with the system name. The HTML is classic e-mail markup (one-column table, inline CSS); everything that
// enters it goes through esc(), and the link must be http(s).

const brasilia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

const FONT = 'Arial,Helvetica,sans-serif';
const BRAND_BLUE = '#2457c5';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(preheader: string, title: string, body: string, footer: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f6fa;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f6fa;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #d6dfea;border-radius:12px;">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e3e9f1;font-family:${FONT};font-size:20px;font-weight:bold;color:${BRAND_BLUE};">Meu Comércio</td></tr>
<tr><td style="padding:28px;font-family:${FONT};font-size:16px;line-height:24px;color:#142033;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#142033;">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e3e9f1;font-family:${FONT};font-size:13px;line-height:20px;color:#55647a;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function verificationEmail(link: string, requestedAt: Date) {
  if (!/^https?:\/\//i.test(link)) throw new Error('Verification link must be http(s)');
  const when = brasilia.format(requestedAt);
  const safeLink = esc(link);
  const body = `<p style="margin:0 0 24px;">Para confirmar este e-mail de recuperação, clique no botão abaixo.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:8px;"><a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:18px;font-weight:bold;line-height:24px;color:#ffffff;text-decoration:none;border-radius:8px;">Confirmar e-mail</a></td></tr></table>
<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:#55647a;">Se o botão não abrir, copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:20px;word-break:break-all;"><a href="${safeLink}" style="color:#1b449c;">${safeLink}</a></p>
<p style="margin:0 0 4px;"><strong>O link vale 30 minutos.</strong></p>
<p style="margin:0;font-size:14px;line-height:20px;color:#55647a;">Pedido feito em ${esc(when)} (horário de Brasília).</p>`;
  return {
    subject: 'Meu Comércio: confirme seu e-mail',
    text: [
      'Para confirmar este e-mail de recuperação, abra o link abaixo e clique em "Confirmar e-mail".',
      '',
      link,
      '',
      'O link vale 30 minutos.',
      `Pedido feito em ${when} (horário de Brasília).`,
      'Se não foi você, ignore este e-mail: nada muda.',
    ].join('\n'),
    html: layout(
      'Confirme seu e-mail de recuperação. O link vale 30 minutos.',
      'Confirme seu e-mail',
      body,
      'Se não foi você, ignore este e-mail: nada muda.'
    ),
  };
}

export function emailChangedNotice(maskedNewEmail: string, changedAt: Date) {
  const when = brasilia.format(changedAt);
  const body = `<p style="margin:0 0 16px;">O e-mail de recuperação da sua conta foi alterado para <strong>${esc(maskedNewEmail)}</strong>.</p>
<p style="margin:0 0 16px;">Este endereço não serve mais para recuperar a conta.</p>
<p style="margin:0;font-size:14px;line-height:20px;color:#55647a;">Alteração feita em ${esc(when)} (horário de Brasília).</p>`;
  return {
    subject: 'Meu Comércio: seu e-mail de recuperação foi alterado',
    text: [
      `O e-mail de recuperação da sua conta foi alterado para ${maskedNewEmail} em ${when} (horário de Brasília).`,
      'Este endereço não serve mais para recuperar a conta.',
      'Não foi você? Entre em contato e troque sua senha de e-mail.',
    ].join('\n'),
    html: layout(
      'O e-mail de recuperação da sua conta foi alterado.',
      'Seu e-mail de recuperação foi alterado',
      body,
      'Não foi você? Entre em contato e troque sua senha de e-mail.'
    ),
  };
}

export function passwordResetEmail(link: string, requestedAt: Date, merchantName: string) {
  if (!/^https?:\/\//i.test(link)) throw new Error('Reset link must be http(s)');
  const when = brasilia.format(requestedAt);
  const safeLink = esc(link);
  const body = `<p style="margin:0 0 16px;">Recebemos um pedido para redefinir a senha da loja <strong>${esc(merchantName)}</strong>. Clique no botão abaixo para escolher uma nova senha.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:8px;"><a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:18px;font-weight:bold;line-height:24px;color:#ffffff;text-decoration:none;border-radius:8px;">Redefinir senha</a></td></tr></table>
<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:#55647a;">Se o botão não abrir, copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:20px;word-break:break-all;"><a href="${safeLink}" style="color:#1b449c;">${safeLink}</a></p>
<p style="margin:0 0 4px;"><strong>O link vale 30 minutos.</strong></p>
<p style="margin:0;font-size:14px;line-height:20px;color:#55647a;">Pedido feito em ${esc(when)} (horário de Brasília).</p>`;
  return {
    subject: 'Meu Comércio: redefinir sua senha',
    text: [
      `Recebemos um pedido para redefinir a senha da loja ${merchantName}. Abra o link abaixo para escolher uma nova senha.`,
      '',
      link,
      '',
      'O link vale 30 minutos.',
      `Pedido feito em ${when} (horário de Brasília).`,
      'Se não foi você, ignore este e-mail: sua senha não muda.',
    ].join('\n'),
    html: layout(
      'Redefina sua senha. O link vale 30 minutos.',
      'Redefinir sua senha',
      body,
      'Se não foi você, ignore este e-mail: sua senha não muda.'
    ),
  };
}

export function passwordChangedNotice(changedAt: Date) {
  const when = brasilia.format(changedAt);
  const body = `<p style="margin:0 0 16px;">A senha da sua conta foi alterada.</p>
<p style="margin:0;font-size:14px;line-height:20px;color:#55647a;">Alteração feita em ${esc(when)} (horário de Brasília).</p>`;
  return {
    subject: 'Meu Comércio: sua senha foi alterada',
    text: [
      `A senha da sua conta foi alterada em ${when} (horário de Brasília).`,
      'Não foi você? Entre em contato e troque sua senha de e-mail.',
    ].join('\n'),
    html: layout(
      'A senha da sua conta foi alterada.',
      'Sua senha foi alterada',
      body,
      'Não foi você? Entre em contato e troque sua senha de e-mail.'
    ),
  };
}
