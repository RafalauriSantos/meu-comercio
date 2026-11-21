export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

export type EmailDeliveryErrorKind = 'timeout' | 'network' | 'rejected' | 'not_configured' | 'daily_limit';

/**
 * Fixed message on purpose: it carries no e-mail, key or response body, so it is safe to log and to send to
 * Sentry (sentry-privacy.ts allows exactly this text). `kind` and `status` are for our own code.
 */
export const EMAIL_DELIVERY_ERROR_MESSAGE = 'E-mail delivery failed';

export class EmailDeliveryError extends Error {
  constructor(
    public readonly kind: EmailDeliveryErrorKind,
    public readonly status?: number
  ) {
    super(EMAIL_DELIVERY_ERROR_MESSAGE);
    this.name = 'EmailDeliveryError';
  }
}
