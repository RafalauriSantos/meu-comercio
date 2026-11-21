// What the person reads on the cash screen right after sign up, depending on whether the link was sent (AC-8).
export function registerEmailNotice(email: string, sent: boolean): string {
  return sent
    ? `Enviamos um link para ${email}. Ele vale 30 minutos.`
    : 'Não conseguimos enviar agora. Você pode confirmar o e-mail depois em Gestão.';
}
