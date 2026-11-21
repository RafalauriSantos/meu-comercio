import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrevoEmailSender } from './brevo-email-sender';
import { EmailDeliveryError } from '../domain/email-sender.port';

// A made-up key, only to prove it never leaks. No test calls the real Brevo: fetch is replaced.
const TEST_KEY = 'xkeysib-TESTE-chave-inventada-0123456789';
const RECIPIENT = 'destinatario@exemplo.com';
const MAIL = { to: RECIPIENT, subject: 'Meu Comércio: teste', text: 'corpo do e-mail', html: '<p>corpo do e-mail</p>' };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BREVO_API_KEY', TEST_KEY);
  vi.stubEnv('BREVO_SENDER_EMAIL', 'loja@exemplo.com');
  vi.stubEnv('BREVO_SENDER_NAME', 'Meu Comércio');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function failureOf(promise: Promise<unknown>): Promise<EmailDeliveryError> {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(EmailDeliveryError);
  return error as EmailDeliveryError;
}

// Everything a failure could expose: message, name, fields, stack and the cause chain.
function everythingAbout(error: Error): string {
  return JSON.stringify({ ...error, message: error.message, name: error.name, stack: error.stack, cause: error.cause });
}

describe('BrevoEmailSender', () => {
  it('envia por POST à API transacional com a chave no cabeçalho e o corpo em HTML e em texto (multipart)', async () => {
    fetchMock.mockResolvedValue(new Response('{"messageId":"x"}', { status: 201 }));

    await new BrevoEmailSender().send(MAIL);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe(TEST_KEY);
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: 'loja@exemplo.com', name: 'Meu Comércio' },
      to: [{ email: RECIPIENT }],
      subject: MAIL.subject,
      htmlContent: MAIL.html,
      textContent: MAIL.text,
    });
    expect(init.body).not.toContain(TEST_KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('AC-49: sem a chave não chama o Brevo e falha como not_configured (e importar o módulo não quebra)', async () => {
    vi.stubEnv('BREVO_API_KEY', '');

    const error = await failureOf(new BrevoEmailSender().send(MAIL));

    expect(error.kind).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error.message).not.toContain('BREVO');
  });

  it('AC-49: sem o remetente também falha como not_configured', async () => {
    vi.stubEnv('BREVO_SENDER_EMAIL', '');
    expect((await failureOf(new BrevoEmailSender().send(MAIL))).kind).toBe('not_configured');
  });

  it.each([401, 500])('AC-47: resposta %i vira rejected com o status e nada do corpo da resposta', async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: `key ${TEST_KEY} for ${RECIPIENT}` }), { status }));

    const error = await failureOf(new BrevoEmailSender().send(MAIL));

    expect(error).toMatchObject({ kind: 'rejected', status, message: 'E-mail delivery failed' });
    const text = everythingAbout(error);
    expect(text).not.toContain(TEST_KEY);
    expect(text).not.toContain(RECIPIENT);
  });

  it('AC-47: esgota em 8 s e aborta a chamada', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error(`aborted ${TEST_KEY}`)));
        })
    );

    const result = failureOf(new BrevoEmailSender().send(MAIL));
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await result;
    expect(error.kind).toBe('timeout');
    expect(everythingAbout(error)).not.toContain(TEST_KEY);
  });

  it('AC-50: erro de rede não carrega a mensagem original (que poderia trazer a chave) nem escreve em log', async () => {
    const spies = (['log', 'error', 'warn', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    fetchMock.mockRejectedValue(new Error(`fetch failed api-key=${TEST_KEY} to ${RECIPIENT}`));

    const error = await failureOf(new BrevoEmailSender().send(MAIL));

    expect(error.kind).toBe('network');
    const text = everythingAbout(error);
    expect(text).not.toContain(TEST_KEY);
    expect(text).not.toContain(RECIPIENT);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TEST_KEY);
    spies.forEach((s) => s.mockRestore());
  });
});
