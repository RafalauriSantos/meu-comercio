import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailDeliveryError, EmailSender } from '../domain/email-sender.port';
import { EmailSendFailedError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { passwordResetEmail } from './recovery-email-templates';

const PURPOSE = 'PASSWORD_RESET';

export interface PasswordResetLinkDeps {
  tokens: RecoveryTokenRepository;
  sender: EmailSender;
  audit: AuditPort;
  /** APP_BASE_URL. The link never uses the Host header (AC-16). */
  baseUrl: string | undefined;
}

/** Same steps as sendVerificationLink for the PASSWORD_RESET purpose (the third copy is the time to share them, slice 4). */
export async function sendPasswordResetLink(
  deps: PasswordResetLinkDeps,
  params: { merchantId: string; username: string; email: string; merchantName: string; now: Date }
): Promise<void> {
  const { merchantId, username, email, merchantName, now } = params;
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
    const link = `${deps.baseUrl.replace(/\/+$/, '')}/redefinir-senha#token=${token}`;
    await deps.sender.send({ to: email, ...passwordResetEmail(link, now, merchantName) });
  } catch (error) {
    // The send error is what gets reported: a failure of these two steps must not replace it.
    await deps.tokens.invalidate(tokenHash, now).catch(() => undefined);
    await deps.audit.record(merchantId, 'ACCESS_RECOVERY_EMAIL_FAILED', username, 'MERCHANT', merchantId, {
      purpose: PURPOSE, code: error instanceof EmailDeliveryError ? error.kind : 'unknown', email: masked,
    }).catch(() => undefined);
    throw new EmailSendFailedError(error);
  }
}
