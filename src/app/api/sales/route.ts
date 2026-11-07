import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import {
  CreateSaleUseCase,
  DuplicateSaleRequestError,
  OpenCashSessionRequiredError,
  ProductNotFoundError,
  ProductInactiveError,
} from '@/modules/sales/application/create-sale.use-case';
import { InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { CashSessionNotOpenError } from '@/modules/sales/domain/errors';
import { Money } from '@/shared/domain/money';
import { PaymentMethod } from '@/modules/sales/domain/payment';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';
import {
  CustomerNotFoundError,
  CustomerInactiveError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
} from '@/modules/customers/domain/errors';

const UNIQUE_VIOLATION = '23505';
// Matches the length of sales.idempotency_key.
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

// Drizzle wraps driver errors: the SQL and params are in the message, the driver error is in `cause`.
function driverCauseOf(error: unknown): object | null {
  if (!(error instanceof Error) || !('cause' in error)) return null;
  return typeof error.cause === 'object' && error.cause !== null ? error.cause : null;
}

function sqlStateOf(error: unknown): string | null {
  const cause = driverCauseOf(error);
  if (cause !== null && 'code' in cause && typeof cause.code === 'string') {
    return cause.code;
  }
  return null;
}

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
  method: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'TAB'], {
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
  ownerPin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'PIN da proprietária deve ter 6 dígitos.')
    .optional()
    .or(z.literal('')),
  ownerUsername: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();

    const rawBody = await request.json().catch(() => ({}));
    const parsed = CreateSaleBodySchema.parse(rawBody);

    const headerKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const idempotencyKey = headerKey?.trim() || parsed.idempotencyKey?.trim() || null;
    if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return NextResponse.json(
        { message: `Chave de idempotência deve ter no máximo ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres.` },
        { status: 400 }
      );
    }
    if (!idempotencyKey && parsed.payments.some((p) => p.method === 'TAB')) {
      return NextResponse.json(
        { message: 'Chave de idempotência é obrigatória para venda fiado.' },
        { status: 400 }
      );
    }

    const useCase = new CreateSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleProductRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      {
        customerRepository: new DrizzleCustomerRepository(),
        customerCreditRepository: new DrizzleCustomerCreditRepository(),
        ownerPinVerifier: new BcryptOwnerPinVerifier(),
      }
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
      ownerPin: parsed.ownerPin || undefined,
      ownerUsername: parsed.ownerUsername || undefined,
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
      return NextResponse.json({ message: error.message, code: 'DUPLICATE_SALE' }, { status: 409 });
    }
    if (error instanceof CashSessionNotOpenError) {
      return NextResponse.json(
        {
          message: 'O caixa foi fechado durante a venda. Abra um novo caixa e registre a venda novamente.',
          code: 'CASH_SESSION_CLOSED',
        },
        { status: 409 }
      );
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
    if (error instanceof CreditLimitExceededError) {
      return NextResponse.json(
        { message: 'Limite de crédito excedido. Necessária autorização com PIN da dona.' },
        { status: 403 }
      );
    }
    if (error instanceof InvalidOwnerPinError) {
      return NextResponse.json({ message: 'PIN de autorização da proprietária inválido.' }, { status: 403 });
    }
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json({ message: 'Cliente não encontrado.' }, { status: 404 });
    }
    if (error instanceof CustomerInactiveError) {
      return NextResponse.json({ message: 'Cliente inativo não pode comprar fiado.' }, { status: 400 });
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
    if (sqlStateOf(error) === UNIQUE_VIOLATION) {
      return NextResponse.json(
        { message: 'Venda duplicada para a chave de idempotência.', code: 'DUPLICATE_SALE' },
        { status: 409 }
      );
    }
    if (driverCauseOf(error) !== null) {
      // Database failures carry SQL text and parameters in their message: log server-side only.
      console.error('Database error creating sale, SQLSTATE', sqlStateOf(error) ?? 'unknown');
      return NextResponse.json({ message: 'Erro interno ao processar venda.' }, { status: 500 });
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error creating sale:', error);
    return NextResponse.json({ message: 'Erro interno ao processar venda.' }, { status: 500 });
  }
}
