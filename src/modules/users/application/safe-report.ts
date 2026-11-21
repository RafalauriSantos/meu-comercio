import { EmailDeliveryError } from '../domain/email-sender.port';
import { EmailSendFailedError } from '../domain/errors';

/**
 * What may go to Sentry. A raw driver error carries the query with its parameters (e-mail, token hash), so
 * only the e-mail delivery error (fixed text) goes as it is; anything else becomes its name with a fixed text.
 */
export function safeToReport(error: unknown): Error {
  if (error instanceof EmailSendFailedError) return safeToReport(error.cause);
  if (error instanceof EmailDeliveryError) return error;
  return new Error(`Password reset step failed: ${error instanceof Error ? error.name : 'unknown'}`);
}
