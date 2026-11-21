import type { OwnerEmailStatus } from '@/frontend/lib/api-client';

/** The fixed notice of Gestão (AC-62, AC-63). Null: nothing to ask, or the state is unknown. */
export function bannerView(status: OwnerEmailStatus | null): { text: string; button: string } | null {
  if (!status || status.verified) return null;
  if (!status.email) {
    return { text: 'Cadastre e confirme seu e-mail para poder recuperar a senha e o PIN', button: 'Cadastrar e-mail' };
  }
  return { text: 'Falta confirmar seu e-mail', button: 'Reenviar link' };
}

export const sentMessage = (email: string): string => `Enviamos um link para ${email}. Ele vale 30 minutos.`;

// The sender name is fixed here (decided with the owner), not read from the server.
export const SPAM_HELP =
  "Não chegou em 2 minutos? Olhe Spam e Promoções. Procure o remetente Meu Comércio. Se achar, clique em 'Não é spam'. Só peça outro link depois de 2 minutos: cada pedido novo cancela o anterior.";

export function resendLabel(seconds: number): string {
  if (seconds <= 0) return 'Reenviar link';
  return `Reenviar link (aguarde ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'})`;
}
