import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import {
  CancelSaleUseCase,
  SaleNotFoundError,
  SaleAlreadyCancelledError,
  InsufficientCashForRefundError,
} from '@/modules/sales/application/cancel-sale.use-case';
import { InvalidOwnerPinError, NoOpenCashSessionError } from '@/modules/customers/domain/errors';

const CancelSaleSchema = z.object({
  ownerPin: z.string().trim().regex(/^\d{4,6}$/, 'O PIN da proprietária deve conter entre 4 e 6 dígitos.'),
  reason: z.string().trim().min(3, 'O motivo do cancelamento deve conter no mínimo 3 caracteres.'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuthenticatedSession();
    const { id } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsed = CancelSaleSchema.parse(rawBody);

    const useCase = new CancelSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      new BcryptOwnerPinVerifier(),
      new DrizzleAuditService(),
      new DrizzleCustomerCreditRepository()
    );

    const cancelledSale = await useCase.execute({
      merchantId: session.merchantId,
      saleId: id,
      operatorId: session.username,
      ownerPin: parsed.ownerPin,
      reason: parsed.reason,
    });

    return NextResponse.json({
      success: true,
      sale: cancelledSale.toJSON(),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof InvalidOwnerPinError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof SaleNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (
      error instanceof SaleAlreadyCancelledError ||
      error instanceof InsufficientCashForRefundError ||
      error instanceof NoOpenCashSessionError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de cancelamento de venda inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error cancelling sale:', error);
    return NextResponse.json(
      { message: 'Erro interno ao cancelar venda.' },
      { status: 500 }
    );
  }
}
