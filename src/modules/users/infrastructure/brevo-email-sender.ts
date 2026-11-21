import { EmailDeliveryError, EmailSender, OutgoingEmail } from '../domain/email-sender.port';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 8000;

/**
 * Sends through the Brevo transactional API. The variables are read at send time, not at import, so the build
 * does not need them. A failure never carries the key, the address or the response body: only a kind and the
 * HTTP status.
 */
export class BrevoEmailSender implements EmailSender {
  async send({ to, subject, text }: OutgoingEmail): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!apiKey || !senderEmail) throw new EmailDeliveryError('not_configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'Meu Comércio' },
          to: [{ email: to }],
          subject,
          textContent: text,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new EmailDeliveryError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new EmailDeliveryError('rejected', response.status);
  }
}
