import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { SettleCustomerDebtUseCase } from '@/modules/customers/application/settle-customer-debt.use-case';
import {
  CustomerNotFoundError,
  CustomerInactiveError,
  DebtSettlementExceedsBalanceError,
  NoOpenCashSessionError,
} from '@/modules/customers/domain/errors';
import { Money } from '@/shared/domain/money';

const SettleCustomerDebtBodySchema = z.object({
  amount: z.union([z.number(), z.string()]).refine((val) => {
    try {
      const m = Money.fromDecimal(val);
      return m.isPositive();
    } catch {
      return false;
    }
  }, 'Valor de quitação deve ser maior que zero.'),
  note: z.string().trim().max(255).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuthenticatedSession();
    const { id } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsed = SettleCustomerDebtBodySchema.parse(rawBody);

    const useCase = new SettleCustomerDebtUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleCustomerCreditRepository(),
      new DrizzleCashSessionRepository(),
      new DrizzleAuditAdapter()
    );

    const result = await useCase.execute({
      merchantId: session.merchantId,
      customerId: id,
      amount: Money.fromDecimal(parsed.amount),
      operatorId: session.username,
      note: parsed.note,
    });

    return NextResponse.json({
      movementId: result.movement.id,
      customerId: id,
      type: result.movement.type,
      amount: result.movement.amount.toDecimal(),
      remainingDebt: result.remainingDebt.toDecimal(),
      cashSessionId: result.cashSessionId,
      createdAt: result.movement.createdAt.toISOString(),
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
    if (
      error instanceof CustomerInactiveError ||
      error instanceof NoOpenCashSessionError ||
      error instanceof DebtSettlementExceedsBalanceError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de quitação inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error settling customer debt:', error);
    return NextResponse.json({ message: 'Erro interno ao quitar débito de cliente.' }, { status: 500 });
  }
}
