import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailDeliveryError, EmailSender } from '../domain/email-sender.port';
import { EmailSendFailedError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { verificationEmail } from './recovery-email-templates';

const PURPOSE = 'EMAIL_VERIFICATION';

export interface VerificationLinkDeps {
  tokens: RecoveryTokenRepository;
  sender: EmailSender;
  audit: AuditPort;
  /** APP_BASE_URL. The link never uses the Host header (AC-16). */
  baseUrl: string | undefined;
}

/**
 * Issues a link (the previous one stops working) and e-mails it. The token goes in the URL fragment, which
 * the browser does not send to the server, so it stays out of server logs. If the e-mail cannot be sent the
 * link is ended.
 */
export async function sendVerificationLink(
  deps: VerificationLinkDeps,
  params: { merchantId: string; username: string; email: string; now: Date }
): Promise<void> {
  const { merchantId, username, email, now } = params;
  const masked = maskEmail(email);
  const token = generateRecoveryToken();
  const tokenHash = hashToken(token);

  await deps.tokens.issue({
    merchantId, username, purpose: PURPOSE, email, tokenHash, expiresAt: recoveryTokenExpiresAt(now), now,
  });
  await deps.audit.record(merchantId, 'ACCESS_RECOVERY_REQUESTED', username, 'MERCHANT', merchantId, {
    purpose: PURPOSE, email: masked,
  });

  try {
    if (!deps.baseUrl) throw new EmailDeliveryError('not_configured');
    const link = `${deps.baseUrl.replace(/\/+$/, '')}/verificar-email#token=${token}`;
    await deps.sender.send({ to: email, ...verificationEmail(link, now) });
  } catch (error) {
    await deps.tokens.invalidate(tokenHash, now);
    await deps.audit.record(merchantId, 'ACCESS_RECOVERY_EMAIL_FAILED', username, 'MERCHANT', merchantId, {
      purpose: PURPOSE, code: error instanceof EmailDeliveryError ? error.kind : 'unknown', email: masked,
    });
    throw new EmailSendFailedError(error);
  }
}
