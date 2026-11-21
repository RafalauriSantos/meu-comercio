import { EmailSender } from '../domain/email-sender.port';
import { BrevoEmailSender } from './brevo-email-sender';

/** The only place the routes get an EmailSender from. Tests replace this module with a fake. */
export function createEmailSender(): EmailSender {
  return new BrevoEmailSender();
}
