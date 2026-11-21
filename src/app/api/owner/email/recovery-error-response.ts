import { NextResponse, after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { ZodError } from 'zod';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import {
  EmailAlreadyVerifiedError,
  EmailInUseError,
  EmailSendFailedError,
  InvalidCurrentPasswordError,
  InvalidEmailError,
  InvalidNewPasswordError,
  InvalidOrExpiredLinkError,
  RecoveryRateLimitedError,
} from '@/modules/users/domain/errors';

// The pages carry links and e-mail addresses: nothing here may be cached.
const NO_STORE = { 'Cache-Control': 'no-store' };

export function recoveryJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * One mapping of the recovery errors to HTTP, shared by the four routes. Technical detail never reaches the
 * response; the log gets only the error name (a message could hold an address or a link).
 */
export function recoveryErrorResponse(error: unknown) {
  if (error && typeof error === 'object' && 'digest' in error) throw error;

  if (error instanceof UnauthorizedError) return recoveryJson({ message: error.message }, 401);
  if (error instanceof ZodError) return recoveryJson({ message: 'Dados inválidos.' }, 400);
  // The code tells a refused password (the link still works) from a refused link or body.
  if (error instanceof InvalidNewPasswordError) return recoveryJson({ message: error.message, code: 'INVALID_PASSWORD' }, 400);
  if (error instanceof InvalidEmailError || error instanceof InvalidOrExpiredLinkError) {
    return recoveryJson({ message: error.message }, 400);
  }
  if (error instanceof InvalidCurrentPasswordError) return recoveryJson({ message: error.message }, 403);
  if (error instanceof EmailInUseError || error instanceof EmailAlreadyVerifiedError) {
    return recoveryJson({ message: error.message }, 409);
  }
  if (error instanceof RecoveryRateLimitedError) {
    return recoveryJson(
      { message: error.message, retryAfterSeconds: error.retryAfterSeconds },
      429,
      { 'Retry-After': String(error.retryAfterSeconds) }
    );
  }
  if (error instanceof EmailSendFailedError) {
    // The cause is an EmailDeliveryError: fixed text, allowed by sentry-privacy.ts.
    Sentry.captureException(error.cause);
    return recoveryJson({ message: error.message }, 503);
  }

  console.error('Erro na recuperação de acesso:', error instanceof Error ? error.name : 'desconhecido');
  Sentry.captureException(error);
  return recoveryJson({ message: 'Erro interno. Tente novamente.' }, 500);
}

/**
 * Runs the task after the response (Next `after()`), then flushes Sentry: a serverless function can freeze
 * right after, and an error captured by the task would be lost.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  after(async () => {
    await task();
    await Sentry.flush(2000);
  });
}
