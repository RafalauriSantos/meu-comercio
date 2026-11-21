import { describe, it, expect } from 'vitest';
import { bannerView, resendLabel, sentMessage, SPAM_HELP } from './owner-email-view';

describe('bannerView', () => {
  it('AC-62: sem e-mail pede o cadastro, com o texto da spec e o botão', () => {
    expect(bannerView({ email: null, verified: false })).toEqual({
      text: 'Cadastre e confirme seu e-mail para poder recuperar a senha e o PIN',
      button: 'Cadastrar e-mail',
    });
  });

  it('AC-63: e-mail ainda não confirmado pede a confirmação, com o botão de reenvio', () => {
    expect(bannerView({ email: 'maria@gmail.com', verified: false })).toEqual({
      text: 'Falta confirmar seu e-mail',
      button: 'Reenviar link',
    });
  });

  it('AC-62: o aviso some só com o e-mail confirmado', () => {
    expect(bannerView({ email: 'maria@gmail.com', verified: true })).toBeNull();
  });

  it('sem estado conhecido (a leitura falhou ou não rodou) não mostra aviso', () => {
    expect(bannerView(null)).toBeNull();
  });
});

describe('textos da aba', () => {
  it('AC-1: mensagem de link enviado', () => {
    expect(sentMessage('maria@gmail.com')).toBe('Enviamos um link para maria@gmail.com. Ele vale 30 minutos.');
  });

  it('AC-66: ajuda de spam, com o remetente fixo', () => {
    expect(SPAM_HELP).toBe(
      "Não chegou em 2 minutos? Olhe Spam e Promoções. Procure o remetente Meu Comércio. Se achar, clique em 'Não é spam'. Só peça outro link depois de 2 minutos: cada pedido novo cancela o anterior."
    );
  });

  it('AC-10: rótulo do reenvio, com e sem espera', () => {
    expect(resendLabel(0)).toBe('Reenviar link');
    expect(resendLabel(42)).toBe('Reenviar link (aguarde 42 segundos)');
    expect(resendLabel(1)).toBe('Reenviar link (aguarde 1 segundo)');
  });
});
