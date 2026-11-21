// Plain text only: no images, no attachments, no short links (AC-67). The subject always starts with the system name.

const brasilia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function verificationEmail(link: string, requestedAt: Date) {
  return {
    subject: 'Meu Comércio: confirme seu e-mail',
    text: [
      'Para confirmar este e-mail de recuperação, abra o link abaixo e clique em "Confirmar e-mail".',
      '',
      link,
      '',
      'O link vale 30 minutos.',
      `Pedido feito em ${brasilia.format(requestedAt)} (horário de Brasília).`,
      'Se não foi você, ignore este e-mail: nada muda.',
    ].join('\n'),
  };
}

export function emailChangedNotice(maskedNewEmail: string, changedAt: Date) {
  return {
    subject: 'Meu Comércio: seu e-mail de recuperação foi alterado',
    text: [
      `O e-mail de recuperação da sua conta foi alterado para ${maskedNewEmail} em ${brasilia.format(changedAt)} (horário de Brasília).`,
      'Este endereço não serve mais para recuperar a conta.',
      'Não foi você? Entre em contato e troque sua senha de e-mail.',
    ].join('\n'),
  };
}
