import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { UpdateCustomerUseCase } from '@/modules/customers/application/update-customer.use-case';
import {
  CustomerAlreadyExistsError,
  CustomerChangedError,
  CustomerHasDebtError,
  CustomerNotFoundError,
  InvalidCreditLimitError,
  InvalidPhoneError,
} from '@/modules/customers/domain/errors';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json({ message: 'Apenas a proprietária pode editar clientes.' }, { status: 403 });
    }

    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ message: 'Identificador de cliente inválido.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const useCase = new UpdateCustomerUseCase(new DrizzleCustomerRepository());

    const customer = await useCase.execute(session.merchantId, session.username, id, body);

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      creditLimit: customer.creditLimit.toDecimal(),
      creditBlocked: customer.creditBlocked,
      active: customer.active,
      updatedAt: customer.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de edição de cliente inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof InvalidPhoneError || error instanceof InvalidCreditLimitError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json({ message: 'Cliente não encontrado.' }, { status: 404 });
    }
    if (error instanceof CustomerAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof CustomerHasDebtError) {
      return NextResponse.json({ code: 'CUSTOMER_HAS_DEBT', message: error.message }, { status: 409 });
    }
    if (error instanceof CustomerChangedError) {
      return NextResponse.json({ code: 'CUSTOMER_CHANGED', message: error.message }, { status: 409 });
    }
    console.error('Error updating customer:', error);
    return NextResponse.json({ message: 'Erro interno ao editar cliente.' }, { status: 500 });
  }
}
