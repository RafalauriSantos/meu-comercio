import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import {
  RegisterMerchantUseCase,
  UsernameAlreadyTakenError,
} from '@/modules/users/application/register-merchant.use-case';
import { createSessionToken } from '@/shared/infrastructure/auth/session';
import { setSessionCookie } from '@/shared/infrastructure/auth/auth-context';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userRepository = new DrizzleUserRepository();
    const useCase = new RegisterMerchantUseCase(userRepository);

    const user = await useCase.execute(body);

    const sessionToken = createSessionToken({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
    });

    await setSessionCookie(sessionToken);

    // The account is already created: whatever goes wrong with the e-mail (Brevo, limit, e-mail confirmed by
    // another store) must not undo it, and must not tell whether the e-mail is already in use (AC-8).
    let verificationEmailSent = false;
    try {
      await buildRecoveryServices().requestEmailVerification.execute({
        merchantId: user.merchantId,
        username: user.username,
        ip: getClientIp(request),
        now: new Date(),
      });
      verificationEmailSent = true;
    } catch (error) {
      console.error('Registration verification e-mail failed:', error instanceof Error ? error.name : 'unknown');
    }

    return NextResponse.json({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
      isOwner: true,
      verificationEmailSent,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof UsernameAlreadyTakenError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({
        message: 'Dados de cadastro inválidos.',
        errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      }, { status: 400 });
    }
    console.error('Merchant registration error:', error);
    return NextResponse.json({ message: 'Erro interno ao realizar cadastro do comércio.' }, { status: 500 });
  }
}
