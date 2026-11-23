import { NextResponse } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { GetAllCustomerBalancesUseCase } from '@/modules/customers/application/get-all-customer-balances.use-case';

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();

    const useCase = new GetAllCustomerBalancesUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleCustomerCreditRepository()
    );

    const balances = await useCase.execute({ merchantId: session.merchantId });

    return NextResponse.json({
      items: balances.map((balance) => ({
        customerId: balance.customer.id,
        name: balance.customer.name,
        phone: balance.customer.phone,
        active: balance.customer.active,
        creditLimit: balance.creditLimit.toDecimal(),
        currentDebt: balance.currentDebt.toDecimal(),
        availableCredit: balance.availableCredit.toDecimal(),
        totalDebits: balance.totalDebits.toDecimal(),
        totalCredits: balance.totalCredits.toDecimal(),
      })),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error fetching customer balances:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar saldos dos clientes.' }, { status: 500 });
  }
}
