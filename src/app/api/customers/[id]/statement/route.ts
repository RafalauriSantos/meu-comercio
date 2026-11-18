import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { GetCustomerStatementUseCase } from '@/modules/customers/application/get-customer-statement.use-case';
import {
  CustomerNotFoundError,
  InvalidStatementCursorError,
  InvalidStatementLimitError,
} from '@/modules/customers/domain/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuthenticatedSession();
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ message: 'Identificador de cliente inválido.' }, { status: 400 });
    }

    const rawLimit = request.nextUrl.searchParams.get('limit');
    const useCase = new GetCustomerStatementUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleCustomerCreditRepository()
    );

    const statement = await useCase.execute({
      merchantId: session.merchantId,
      customerId: id,
      limit: rawLimit === null ? undefined : /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN,
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
    });

    return NextResponse.json({
      items: statement.items.map((item) => ({
        id: item.id,
        type: item.type,
        amount: item.amount.toDecimal(),
        balanceAfter: item.balanceAfter.toDecimal(),
        createdAt: item.createdAt.toISOString(),
        saleId: item.saleId,
        operator: item.operator,
        note: item.note,
      })),
      nextCursor: statement.nextCursor,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof InvalidStatementLimitError || error instanceof InvalidStatementCursorError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json({ message: 'Cliente não encontrado.' }, { status: 404 });
    }
    console.error('Error fetching customer statement:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar o extrato do cliente.' }, { status: 500 });
  }
}
