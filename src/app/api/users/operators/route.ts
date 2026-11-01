import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import {
  CreateOperatorUseCase,
  UsernameAlreadyExistsError,
} from '@/modules/users/application/create-operator.use-case';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode cadastrar novos operadores de caixa.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userRepo = new DrizzleUserRepository();
    const useCase = new CreateOperatorUseCase(userRepo);

    const operator = await useCase.execute({
      merchantId: session.merchantId,
      username: body.username,
      password: body.password,
    });

    return NextResponse.json(
      {
        username: operator.username,
        merchantId: operator.merchantId,
        authorities: Array.from(operator.authorities),
        enabled: operator.enabled,
        createdAt: operator.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof UsernameAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de operador inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Erro ao cadastrar operador:', error);
    return NextResponse.json(
      { message: 'Erro interno ao cadastrar operador de caixa.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode listar operadores do comércio.' },
        { status: 403 }
      );
    }

    const userRepo = new DrizzleUserRepository();
    const allUsers = await userRepo.listOperators(session.merchantId);

    // Filter to only operators (not the owner)
    const operators = allUsers
      .filter((u) => !u.isOwner())
      .map((u) => ({
        username: u.username,
        enabled: u.enabled,
        createdAt: u.createdAt.toISOString(),
        authorities: Array.from(u.authorities),
      }));

    return NextResponse.json({ items: operators });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Erro ao listar operadores:', error);
    return NextResponse.json(
      { message: 'Erro interno ao consultar operadores.' },
      { status: 500 }
    );
  }
}
