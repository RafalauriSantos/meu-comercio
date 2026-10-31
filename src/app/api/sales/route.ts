import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  CreateSaleUseCase,
  DuplicateSaleRequestError,
  OpenCashSessionRequiredError,
  ProductNotFoundError,
  ProductInactiveError,
} from '@/modules/sales/application/create-sale.use-case';
import { InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { Money } from '@/shared/domain/money';
import { PaymentMethod } from '@/modules/sales/domain/payment';

const isValidMoney = (val: unknown, check: (m: Money) => boolean) => {
  if (val === undefined || val === null) return true;
  try {
    return check(Money.fromDecimal(val as number | string));
  } catch {
    return false;
  }
};

const toMoneyOrUndefined = (val?: number | string | null) =>
  val !== undefined && val !== null ? Money.fromDecimal(val) : undefined;

const SaleItemSchema = z.object({
  productId: z.string().trim().min(1, 'ID do produto é obrigatório'),
  quantity: z.number().int('Quantidade deve ser inteira').positive('Quantidade deve ser positiva'),
});

const PaymentSchema = z.object({
  method: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'], {
    message: 'Método de pagamento inválido.',
  }),
  amount: z.union([z.number(), z.string()]).refine(
    (val) => isValidMoney(val, (m) => m.isPositive()),
    'Valor do pagamento deve ser positivo.'
  ),
  receivedAmount: z.union([z.number(), z.string()]).optional().nullable().refine(
    (val) => isValidMoney(val, (m) => !m.isNegative()),
    'Valor recebido não pode ser negativo.'
  ),
  installments: z.number().int().min(1).optional(),
  externalReference: z.string().trim().max(128).optional().nullable(),
});

const CreateSaleBodySchema = z.object({
  items: z.array(SaleItemSchema).min(1, 'A venda deve conter pelo menos um item.'),
  payments: z.array(PaymentSchema).min(1, 'A venda deve conter pelo menos uma forma de pagamento.'),
  discountAmount: z.union([z.number(), z.string()]).optional().nullable().refine(
    (val) => isValidMoney(val, (m) => !m.isNegative()),
    'Desconto não pode ser negativo.'
  ),
  discountReason: z.string().trim().optional().nullable(),
  idempotencyKey: z.string().trim().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();

    const rawBody = await request.json().catch(() => ({}));
    const parsed = CreateSaleBodySchema.parse(rawBody);

    const headerKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const idempotencyKey = headerKey?.trim() || parsed.idempotencyKey?.trim() || null;

    const useCase = new CreateSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleProductRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      new DrizzleAuditAdapter()
    );

    const sale = await useCase.execute({
      merchantId: session.merchantId,
      operatorId: session.username,
      items: parsed.items,
      payments: parsed.payments.map((p) => ({
        method: p.method as PaymentMethod,
        amount: Money.fromDecimal(p.amount),
        receivedAmount: toMoneyOrUndefined(p.receivedAmount),
        installments: p.installments,
        externalReference: p.externalReference ?? undefined,
      })),
      discountAmount: toMoneyOrUndefined(parsed.discountAmount),
      discountReason: parsed.discountReason ?? undefined,
      idempotencyKey,
    });

    return NextResponse.json(sale.toJSON(), { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof DuplicateSaleRequestError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (
      error instanceof OpenCashSessionRequiredError ||
      error instanceof InsufficientStockError ||
      error instanceof ProductInactiveError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de requisição de venda inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error creating sale:', error);
    return NextResponse.json({ message: 'Erro interno ao processar venda.' }, { status: 500 });
  }
}
