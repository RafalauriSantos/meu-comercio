import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { cookies } from 'next/headers';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import {
  AuthenticateUserUseCase,
  InvalidCredentialsError,
  AccountLockedError,
  AccountDisabledError,
} from '@/modules/users/application/authenticate-user.use-case';
import { createSessionToken, getSessionCookieName } from '@/shared/infrastructure/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userRepository = new DrizzleUserRepository();
    const useCase = new AuthenticateUserUseCase(userRepository);

    const user = await useCase.execute(body);

    const sessionToken = createSessionToken({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
    });

    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    });

    return NextResponse.json({
      username: user.username,
      merchantId: user.merchantId,
      authorities: Array.from(user.authorities),
      isOwner: user.isOwner(),
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof AccountLockedError) {
      return NextResponse.json({ message: error.message }, { status: 423 }); // 423 Locked
    }
    if (error instanceof AccountDisabledError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({
        message: 'Dados de login inválidos.',
        errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      }, { status: 400 });
    }
    console.error('Login error:', error);
    return NextResponse.json({ message: 'Erro interno ao realizar autenticação.' }, { status: 500 });
  }
}
