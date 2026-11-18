import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  CreateProductUseCase,
  BarcodeAlreadyExistsError,
  BarcodeGenerationFailedError,
  OperatorProductRuleError,
  assertOperatorProductRules,
} from '@/modules/products/application/create-product.use-case';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    const body = await request.json();
    // D-25: anyone logged in may register; a non-owner only with a price above zero and no initial stock.
    if (!isSessionOwner(session)) assertOperatorProductRules(body);

    const productRepo = new DrizzleProductRepository();
    const inventoryRepo = new DrizzleInventoryRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new CreateProductUseCase(productRepo, inventoryRepo, auditService);

    const product = await useCase.execute(session.merchantId, session.username, body);

    const availableQuantity = await inventoryRepo.getAvailableQuantity(session.merchantId, product.id);

    return NextResponse.json(
      {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        salePrice: product.salePrice.toDecimal(),
        unit: product.unit,
        availableQuantity,
        active: product.active,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof BarcodeAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof OperatorProductRuleError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof BarcodeGenerationFailedError) {
      console.error('Error creating product:', error);
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de cadastro de produto inválidos.',
          errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error creating product:', error);
    return NextResponse.json({ message: 'Erro interno ao cadastrar produto.' }, { status: 500 });
  }
}

const listQuerySchema = z.object({
  page: z.coerce.number('A página deve ser um número inteiro.').int('A página deve ser um número inteiro.').min(1, 'A página deve ser 1 ou maior.').default(1),
  pageSize: z.coerce
    .number('O tamanho da página deve ser um número inteiro.')
    .int('O tamanho da página deve ser um número inteiro.')
    .min(1, 'O tamanho da página deve ser de 1 a 100.')
    .max(100, 'O tamanho da página deve ser de 1 a 100.')
    .default(100),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const { page, pageSize } = listQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });

    // D-27: ?active=false lists only the deactivated products, and only for the owner. The default is the active ones.
    const activeParam = searchParams.get('active');
    if (activeParam !== null && activeParam !== 'true' && activeParam !== 'false') {
      return NextResponse.json({ message: 'O filtro de ativos deve ser true ou false.' }, { status: 400 });
    }
    const active = activeParam !== 'false';
    if (!active && !isSessionOwner(session)) {
      return NextResponse.json({ message: 'Apenas a proprietária pode ver os produtos desativados.' }, { status: 403 });
    }

    const result = await new DrizzleProductRepository().listPage(session.merchantId, { query, page, pageSize, active });

    return NextResponse.json({
      items: result.items.map(({ product, availableQuantity }) => ({
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        salePrice: product.salePrice.toDecimal(),
        unit: product.unit,
        availableQuantity,
        active: product.active,
        updatedAt: product.updatedAt.toISOString(),
      })),
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
    }
    console.error('Error fetching products:', error);
    return NextResponse.json({ message: 'Erro interno ao buscar produtos.' }, { status: 500 });
  }
}

