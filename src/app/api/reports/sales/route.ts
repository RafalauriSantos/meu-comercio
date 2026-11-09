import { NextRequest, NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleReportRepository } from '@/modules/reports/infrastructure/drizzle-report-repository';
import { GetSalesReportUseCase } from '@/modules/reports/application/get-sales-report.use-case';
import { InvalidPeriodError, PERIOD_KINDS } from '@/modules/reports/domain/report-period';

const QuerySchema = z.object({
  period: z.enum(PERIOD_KINDS, { message: 'Período inválido. Use hoje, ontem, semana, mês ou personalizado.' }),
  from: z.string().optional(),
  to: z.string().optional(),
});

// The sales report: only the owner reads how much the shop sold.
export async function GET(request: NextRequest) {
  // Reads the clock and the database for every request; keeps it out of the build.
  await connection();

  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json({ message: 'Apenas a proprietária pode ver os relatórios de vendas.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse({
      period: searchParams.get('period') ?? 'today',
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });

    const useCase = new GetSalesReportUseCase(new DrizzleReportRepository(db));
    const report = await useCase.execute(session.merchantId, query.period, { from: query.from, to: query.to });

    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Período inválido.' }, { status: 400 });
    }
    if (error instanceof InvalidPeriodError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error building the sales report:', error);
    return NextResponse.json({ message: 'Erro interno ao montar o relatório de vendas.' }, { status: 500 });
  }
}
