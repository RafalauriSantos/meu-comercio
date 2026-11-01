import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  RecordCashWithdrawalUseCase,
  NoOpenCashSessionError,
  InsufficientCashForWithdrawalError,
  InvalidCashOperationReasonError,
  InvalidCashOperationAmountError,
} from '@/modules/cash/application/record-cash-withdrawal.use-case';
import { Money } from '@/shared/domain/money';

const CashWithdrawalSchema = z.object({
  amount: z.union([z.number(), z.string()]).refine((val) => {
    try {
      const m = Money.fromDecimal(val);
      return m.isPositive();
    } catch {
      return false;
    }
  }, 'O valor da sangria deve ser estritamente positivo.'),
  reason: z.string().trim().min(3, 'O motivo deve conter no mínimo 3 caracteres.'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    const rawBody = await request.json().catch(() => ({}));
    const parsed = CashWithdrawalSchema.parse(rawBody);

    const cashRepo = new DrizzleCashSessionRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new RecordCashWithdrawalUseCase(cashRepo, auditService);

    const result = await useCase.execute({
      merchantId: session.merchantId,
      operatorId: session.username,
      amount: Money.fromDecimal(parsed.amount),
      reason: parsed.reason,
    });

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      movementType: result.movementType,
      amount: result.amount.toDecimal(),
      expectedCash: result.expectedCash.toDecimal(),
      reason: result.reason,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (
      error instanceof NoOpenCashSessionError ||
      error instanceof InsufficientCashForWithdrawalError ||
      error instanceof InvalidCashOperationReasonError ||
      error instanceof InvalidCashOperationAmountError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de sangria de caixa inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error recording cash withdrawal:', error);
    return NextResponse.json(
      { message: 'Erro interno ao realizar sangria de caixa.' },
      { status: 500 }
    );
  }
}
