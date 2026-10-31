import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { GetCustomerBalanceUseCase } from '@/modules/customers/application/get-customer-balance.use-case';
import { CustomerNotFoundError } from '@/modules/customers/domain/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuthenticatedSession();
    const { id } = await params;

    const useCase = new GetCustomerBalanceUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleCustomerCreditRepository()
    );

    const balance = await useCase.execute({
      merchantId: session.merchantId,
      customerId: id,
    });

    return NextResponse.json({
      customerId: balance.customer.id,
      name: balance.customer.name,
      phone: balance.customer.phone,
      active: balance.customer.active,
      creditLimit: balance.creditLimit.toDecimal(),
      currentDebt: balance.currentDebt.toDecimal(),
      availableCredit: balance.availableCredit.toDecimal(),
      totalDebits: balance.totalDebits.toDecimal(),
      totalCredits: balance.totalCredits.toDecimal(),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    console.error('Error fetching customer balance:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar saldo do cliente.' }, { status: 500 });
  }
}
