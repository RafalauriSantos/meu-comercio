import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry-privacy';
import { EmailDeliveryError } from '@/modules/users/domain/email-sender.port';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const scrub = (value: string): Any =>
  scrubEvent({ exception: { values: [{ type: 'EmailDeliveryError', value }] } } as Any) as Any;

describe('EmailDeliveryError no Sentry (AC-47, AC-50)', () => {
  it('mantém o texto fixo da própria classe, sem e-mail, chave nem corpo da resposta', () => {
    const fixed = new EmailDeliveryError('rejected', 401).message;
    expect(scrub(fixed).exception.values[0]).toMatchObject({ type: 'EmailDeliveryError', value: fixed });
  });

  it('descarta qualquer outro texto nessa classe', () => {
    const result = scrub('rejected for maria@gmail.com api-key=xkeysib-123');
    expect(result.exception.values[0].value).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('maria');
    expect(JSON.stringify(result)).not.toContain('xkeysib');
  });
});
