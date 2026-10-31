import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  CloseCashSessionUseCase,
  CashSessionNotOpenError,
  CashSessionCloseNotAuthorizedError,
  DiscrepancyReasonRequiredError,
} from '@/modules/cash/application/close-cash-session.use-case';

const RequestBodySchema = z.object({
  sessionId: z.string().uuid('ID de sessão de caixa inválido'),
  closingBalance: z.union([z.number(), z.string()]),
  discrepancyReason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    const isOwner = session.authorities.includes('ROLE_OWNER');
    const hasPermission = isOwner || session.authorities.includes('CLOSE_CASH');
    if (!hasPermission) {
      return NextResponse.json(
        { message: 'Você não tem permissão para fechar o caixa (CLOSE_CASH).' },
        { status: 403 }
      );
    }

    const json = await request.json();
    const parsed = RequestBodySchema.parse(json);

    const cashRepository = new DrizzleCashSessionRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new CloseCashSessionUseCase(cashRepository, auditService);

    const result = await useCase.execute(
      session.merchantId,
      parsed.sessionId,
      session.username,
      isOwner,
      {
        closingBalance: parsed.closingBalance,
        discrepancyReason: parsed.discrepancyReason,
      }
    );

    return NextResponse.json({
      success: true,
      expectedCash: result.expectedCash.toDecimal(),
      closingBalance: result.closingBalance.toDecimal(),
      difference: result.difference.toDecimal(),
      closedBy: session.username,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof CashSessionNotOpenError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof CashSessionCloseNotAuthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof DiscrepancyReasonRequiredError) {
      return NextResponse.json({ message: error.message }, { status: 422 }); // 422 Unprocessable Entity
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de fechamento de caixa inválidos.',
          errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error closing cash session:', error);
    return NextResponse.json({ message: 'Erro interno ao fechar sessão de caixa.' }, { status: 500 });
  }
}
