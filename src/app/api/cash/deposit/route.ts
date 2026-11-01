import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  RecordCashDepositUseCase,
  NoOpenCashSessionError,
  InvalidCashOperationReasonError,
  InvalidCashOperationAmountError,
} from '@/modules/cash/application/record-cash-deposit.use-case';
import { Money } from '@/shared/domain/money';

const CashDepositSchema = z.object({
  amount: z.union([z.number(), z.string()]).refine((val) => {
    try {
      const m = Money.fromDecimal(val);
      return m.isPositive();
    } catch {
      return false;
    }
  }, 'O valor do suprimento deve ser estritamente positivo.'),
  reason: z.string().trim().min(3, 'O motivo deve conter no mínimo 3 caracteres.'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    const rawBody = await request.json().catch(() => ({}));
    const parsed = CashDepositSchema.parse(rawBody);

    const cashRepo = new DrizzleCashSessionRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new RecordCashDepositUseCase(cashRepo, auditService);

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
      error instanceof InvalidCashOperationReasonError ||
      error instanceof InvalidCashOperationAmountError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de suprimento de caixa inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error recording cash deposit:', error);
    return NextResponse.json(
      { message: 'Erro interno ao realizar suprimento de caixa.' },
      { status: 500 }
    );
  }
}
