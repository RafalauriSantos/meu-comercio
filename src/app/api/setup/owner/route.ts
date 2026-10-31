import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import {
  InitialOwnerSetupUseCase,
  SetupAlreadyCompletedError,
} from '@/modules/users/application/initial-owner-setup.use-case';
import { createSessionToken } from '@/shared/infrastructure/auth/session';
import { setSessionCookie } from '@/shared/infrastructure/auth/auth-context';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userRepository = new DrizzleUserRepository();
    const useCase = new InitialOwnerSetupUseCase(userRepository);

    const user = await useCase.execute(body);

    const sessionToken = createSessionToken({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
    });

    await setSessionCookie(sessionToken);

    return NextResponse.json({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
      isOwner: true,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SetupAlreadyCompletedError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({
        message: 'Dados de cadastro inválidos.',
        errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      }, { status: 400 });
    }
    console.error('Owner setup error:', error);
    return NextResponse.json({ message: 'Erro interno ao realizar cadastro inicial.' }, { status: 500 });
  }
}
