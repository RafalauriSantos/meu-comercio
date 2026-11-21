import { EmailSender, OutgoingEmail } from '../domain/email-sender.port';

/** Test fake: keeps what would be sent; `failWith` makes sends throw (only to `onlyTo`, when given); `delayMs` simulates a slow provider. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  delayMs = 0;
  private failure: Error | null = null;
  private failOnlyTo: string | undefined;

  failWith(error: Error | null, onlyTo?: string): void {
    this.failure = error;
    this.failOnlyTo = onlyTo;
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failure && (!this.failOnlyTo || this.failOnlyTo === email.to)) throw this.failure;
    this.sent.push(email);
  }
}
