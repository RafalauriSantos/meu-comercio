import { describe, it, expect } from 'vitest';
import { registerEmailNotice } from './register-email-notice';

describe('registerEmailNotice (AC-8)', () => {
  it('says where the link went and for how long it is valid', () => {
    expect(registerEmailNotice('maria@loja.com', true)).toBe('Enviamos um link para maria@loja.com. Ele vale 30 minutos.');
  });

  it('says the e-mail can be confirmed later in Gestão when sending failed', () => {
    expect(registerEmailNotice('maria@loja.com', false)).toBe(
      'Não conseguimos enviar agora. Você pode confirmar o e-mail depois em Gestão.'
    );
  });
});
