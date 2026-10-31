import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { GetCurrentCashSessionUseCase } from '@/modules/cash/application/get-current-cash-session.use-case';

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuthSession();
    const repository = new DrizzleCashSessionRepository();
    const useCase = new GetCurrentCashSessionUseCase(repository);

    const currentSession = await useCase.execute(session.merchantId);

    if (!currentSession) {
      return NextResponse.json({ open: false, session: null });
    }

    return NextResponse.json({
      open: true,
      session: {
        id: currentSession.id,
        openedBy: currentSession.openedBy,
        openingBalance: currentSession.openingBalance.toDecimal(),
        openedAt: currentSession.openedAt,
        expectedCash: currentSession.expectedCash.toDecimal(),
        movementsCount: currentSession.movementsCount,
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error fetching current cash session:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar caixa atual.' }, { status: 500 });
  }
}
