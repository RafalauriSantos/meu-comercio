import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { hasSessionAuthority } from '@/shared/infrastructure/auth/session';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  OpenCashSessionUseCase,
  CashSessionAlreadyOpenError,
} from '@/modules/cash/application/open-cash-session.use-case';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    if (!hasSessionAuthority(session, 'OPEN_CASH')) {
      return NextResponse.json(
        { message: 'Você não tem permissão para abrir o caixa (OPEN_CASH).' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const cashRepository = new DrizzleCashSessionRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new OpenCashSessionUseCase(cashRepository, auditService);

    const cashSession = await useCase.execute(session.merchantId, session.username, body);

    return NextResponse.json(
      {
        id: cashSession.id,
        openedBy: cashSession.openedBy,
        openingBalance: cashSession.openingBalance.toDecimal(),
        openedAt: cashSession.openedAt,
        status: cashSession.status,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof CashSessionAlreadyOpenError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de abertura de caixa inválidos.',
          errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error opening cash session:', error);
    return NextResponse.json({ message: 'Erro interno ao abrir sessão de caixa.' }, { status: 500 });
  }
}
