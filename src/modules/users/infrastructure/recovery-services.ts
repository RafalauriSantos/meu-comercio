import * as Sentry from '@sentry/nextjs';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { ChangeOwnerEmailUseCase } from '../application/change-owner-email.use-case';
import { ConfirmEmailVerificationUseCase } from '../application/confirm-email-verification.use-case';
import { GetOwnerEmailStatusUseCase } from '../application/get-owner-email-status.use-case';
import { InspectEmailVerificationUseCase } from '../application/inspect-email-verification.use-case';
import { InspectPasswordResetLinkUseCase } from '../application/inspect-password-reset-link.use-case';
import { RequestEmailVerificationUseCase } from '../application/request-email-verification.use-case';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { DrizzleOwnerEmailRepository } from './drizzle-owner-email-repository';
import { DrizzlePasswordResetRepository } from './drizzle-password-reset-repository';
import { DrizzleRecoveryRequestLimiter } from './drizzle-recovery-request-limiter';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { createEmailSender } from './email-sender-factory';

/**
 * The single place that wires the recovery adapters. The routes call this and never use `new` themselves.
 * `defer` runs a task after the response: the routes that send e-mail after answering pass `after()`.
 */
export function buildRecoveryServices(defer: (task: () => Promise<void>) => void = (task) => void task()) {
  const limiter = new DrizzleRecoveryRequestLimiter(db);
  const owners = new DrizzleOwnerEmailRepository(db);
  const resets = new DrizzlePasswordResetRepository(db);
  const tokens = new DrizzleRecoveryTokenRepository(db);
  const sender = createEmailSender();
  const audit = new DrizzleAuditService();
  const baseUrl = process.env.APP_BASE_URL;
  const reportError = (error: unknown) => Sentry.captureException(error);

  return {
    requestEmailVerification: new RequestEmailVerificationUseCase({
      limiter, owners, tokens, sender, audit, baseUrl,
      users: new DrizzleUserRepository(),
    }),
    changeOwnerEmail: new ChangeOwnerEmailUseCase({
      limiter, owners, tokens, sender, audit, baseUrl,
      users: new DrizzleUserRepository(),
      reportError,
    }),
    getOwnerEmailStatus: new GetOwnerEmailStatusUseCase({ owners }),
    inspectEmailVerification: new InspectEmailVerificationUseCase({ limiter, owners, tokens }),
    confirmEmailVerification: new ConfirmEmailVerificationUseCase({ limiter, owners, audit }),
    requestPasswordReset: new RequestPasswordResetUseCase({ limiter, resets, tokens, sender, audit, baseUrl, defer, reportError }),
    inspectPasswordReset: new InspectPasswordResetLinkUseCase({ limiter, resets, tokens }),
    resetPassword: new ResetPasswordUseCase({ limiter, resets, tokens, audit, sender, defer, reportError }),
  };
}
