import { NextResponse } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { GetCreditMetricsUseCase } from '@/modules/customers/application/get-credit-metrics.use-case';

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();

    const useCase = new GetCreditMetricsUseCase(
      new DrizzleCustomerCreditRepository(),
      new DrizzleCustomerRepository()
    );

    const metrics = await useCase.execute({
      merchantId: session.merchantId,
    });

    return NextResponse.json({
      totalOutstandingCredit: metrics.totalOutstandingCredit.toDecimal(),
      totalSettledCredit: metrics.totalSettledCredit.toDecimal(),
      activeDebtorsCount: metrics.activeDebtorsCount,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error fetching customer credit metrics:', error);
    return NextResponse.json(
      { message: 'Erro interno ao consultar métricas de crédito.' },
      { status: 500 }
    );
  }
}
