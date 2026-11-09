import { NextResponse, connection } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleRecentSalesReader } from '@/modules/sales/infrastructure/drizzle-recent-sales-reader';
import { ListRecentSalesUseCase } from '@/modules/sales/application/list-recent-sales.use-case';

// The confirmed sales of today, so the person at the counter can pick the one to cancel instead of typing its id.
// Anyone signed in may look: cancelling still needs the owner's PIN (POST /api/sales/[id]/cancel).
export async function GET() {
  // Reads the clock and the database for every request; keeps it out of the build.
  await connection();

  try {
    const session = await requireAuthenticatedSession();
    const useCase = new ListRecentSalesUseCase(new DrizzleRecentSalesReader(db));
    const items = await useCase.execute(session.merchantId);

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error listing the recent sales:', error);
    return NextResponse.json({ message: 'Erro interno ao listar as vendas de hoje.' }, { status: 500 });
  }
}
