import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { AuthorizeCreditSaleUseCase } from '@/modules/customers/application/authorize-credit-sale.use-case';
import {
  CustomerNotFoundError,
  CustomerInactiveError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
} from '@/modules/customers/domain/errors';
import { Money } from '@/shared/domain/money';

const AuthorizeCreditSaleBodySchema = z.object({
  saleAmount: z.union([z.number(), z.string()]).refine((val) => {
    try {
      const m = Money.fromDecimal(val);
      return m.isPositive();
    } catch {
      return false;
    }
  }, 'Valor da venda a crédito deve ser maior que zero.'),
  ownerPin: z.string().trim().optional(),
  ownerUsername: z.string().trim().optional(),
  saleId: z.string().trim().optional().nullable(),
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
    const parsed = AuthorizeCreditSaleBodySchema.parse(rawBody);

    const useCase = new AuthorizeCreditSaleUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleCustomerCreditRepository(),
      new BcryptOwnerPinVerifier(),
      new DrizzleAuditAdapter()
    );

    const result = await useCase.execute({
      merchantId: session.merchantId,
      customerId: id,
      saleAmount: Money.fromDecimal(parsed.saleAmount),
      operatorId: session.username,
      ownerPin: parsed.ownerPin,
      ownerUsername: parsed.ownerUsername,
      saleId: parsed.saleId,
      note: parsed.note,
    });

    return NextResponse.json({
      authorized: result.authorized,
      movementId: result.movement.id,
      requiresOwnerPin: result.requiresOwnerPin,
      authorizedBy: result.authorizedBy,
      saleAmount: result.movement.amount.toDecimal(),
      customerId: id,
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
    if (error instanceof CustomerInactiveError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CreditLimitExceededError) {
      return NextResponse.json(
        { message: 'Limite de crédito excedido. Necessária autorização com PIN da dona.' },
        { status: 403 }
      );
    }
    if (error instanceof InvalidOwnerPinError) {
      return NextResponse.json(
        { message: 'PIN de autorização da proprietária inválido.' },
        { status: 403 }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de autorização de crédito inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error authorizing credit sale:', error);
    return NextResponse.json({ message: 'Erro interno ao autorizar crédito.' }, { status: 500 });
  }
}
