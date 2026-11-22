import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailDeliveryError, EmailSender } from '../domain/email-sender.port';
import { EmailSendFailedError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { passwordResetEmail, verificationEmail } from './recovery-email-templates';

/** Per purpose: where the link opens and which e-mail carries it. */
const RECOVERY_LINKS = {
  EMAIL_VERIFICATION: {
    path: '/verificar-email',
    buildEmail: (link: string, now: Date) => verificationEmail(link, now),
  },
  PASSWORD_RESET: {
    path: '/redefinir-senha',
    buildEmail: (link: string, now: Date, merchantName: string) => passwordResetEmail(link, now, merchantName),
  },
};

export type SendableRecoveryPurpose = keyof typeof RECOVERY_LINKS;

export interface RecoveryLinkDeps {
  tokens: RecoveryTokenRepository;
  sender: EmailSender;
  audit: AuditPort;
  /** APP_BASE_URL. The link never uses the Host header (AC-16). */
  baseUrl: string | undefined;
}

/**
 * Issues a link (the previous one of the same purpose stops working) and e-mails it. The token goes in the URL
 * fragment, which the browser does not send to the server, so it stays out of server logs. If the e-mail cannot
 * be sent the link is ended.
 */
export async function sendRecoveryLink(
  deps: RecoveryLinkDeps,
  purpose: SendableRecoveryPurpose,
  params: { merchantId: string; username: string; email: string; merchantName?: string; now: Date }
): Promise<void> {
  const { merchantId, username, email, merchantName = '', now } = params;
  const { path, buildEmail } = RECOVERY_LINKS[purpose];
  const masked = maskEmail(email);
  const token = generateRecoveryToken();
  const tokenHash = hashToken(token);

  await deps.tokens.issue({
    merchantId, username, purpose, email, tokenHash, expiresAt: recoveryTokenExpiresAt(now), now,
  });
  await deps.audit.record(merchantId, 'ACCESS_RECOVERY_REQUESTED', username, 'MERCHANT', merchantId, {
    purpose, email: masked,
  });

  try {
    if (!deps.baseUrl) throw new EmailDeliveryError('not_configured');
    const link = `${deps.baseUrl.replace(/\/+$/, '')}${path}#token=${token}`;
    await deps.sender.send({ to: email, ...buildEmail(link, now, merchantName) });
  } catch (error) {
    // The send error is what gets reported: a failure of these two steps must not replace it.
    await deps.tokens.invalidate(tokenHash, now).catch(() => undefined);
    await deps.audit.record(merchantId, 'ACCESS_RECOVERY_EMAIL_FAILED', username, 'MERCHANT', merchantId, {
      purpose, code: error instanceof EmailDeliveryError ? error.kind : 'unknown', email: masked,
    }).catch(() => undefined);
    throw new EmailSendFailedError(error);
  }
}
