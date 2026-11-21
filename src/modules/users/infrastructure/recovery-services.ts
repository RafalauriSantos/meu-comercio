import * as Sentry from '@sentry/nextjs';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { ChangeOwnerEmailUseCase } from '../application/change-owner-email.use-case';
import { ConfirmEmailVerificationUseCase } from '../application/confirm-email-verification.use-case';
import { InspectEmailVerificationUseCase } from '../application/inspect-email-verification.use-case';
import { RequestEmailVerificationUseCase } from '../application/request-email-verification.use-case';
import { DrizzleOwnerEmailRepository } from './drizzle-owner-email-repository';
import { DrizzleRecoveryRequestLimiter } from './drizzle-recovery-request-limiter';
import { DrizzleRecoveryTokenRepository } from './drizzle-recovery-token-repository';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { createEmailSender } from './email-sender-factory';

/** The single place that wires the recovery adapters. The routes call this and never use `new` themselves. */
export function buildRecoveryServices() {
  const limiter = new DrizzleRecoveryRequestLimiter(db);
  const owners = new DrizzleOwnerEmailRepository(db);
  const tokens = new DrizzleRecoveryTokenRepository(db);
  const sender = createEmailSender();
  const audit = new DrizzleAuditService();
  const baseUrl = process.env.APP_BASE_URL;

  return {
    requestEmailVerification: new RequestEmailVerificationUseCase({
      limiter, owners, tokens, sender, audit, baseUrl,
      users: new DrizzleUserRepository(),
    }),
    changeOwnerEmail: new ChangeOwnerEmailUseCase({
      limiter, owners, tokens, sender, audit, baseUrl,
      users: new DrizzleUserRepository(),
      reportError: (error) => Sentry.captureException(error),
    }),
    inspectEmailVerification: new InspectEmailVerificationUseCase({ limiter, owners, tokens }),
    confirmEmailVerification: new ConfirmEmailVerificationUseCase({ limiter, owners, audit }),
  };
}
