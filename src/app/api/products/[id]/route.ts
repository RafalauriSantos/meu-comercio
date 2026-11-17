import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { BarcodeAlreadyExistsError, BarcodeGenerationFailedError } from '@/modules/products/application/create-product.use-case';
import { UpdateProductUseCase, ProductNotFoundError } from '@/modules/products/application/update-product.use-case';
import { ProductChangedError } from '@/modules/products/domain/product-errors';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode editar produtos do catálogo.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ message: 'Identificador de produto inválido.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const productRepo = new DrizzleProductRepository();
    const useCase = new UpdateProductUseCase(productRepo);

    const product = await useCase.execute(session.merchantId, session.username, id, body);

    const availableQuantity = await new DrizzleInventoryRepository().getAvailableQuantity(session.merchantId, product.id);

    return NextResponse.json({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      salePrice: product.salePrice.toDecimal(),
      unit: product.unit,
      availableQuantity,
      active: product.active,
      updatedAt: product.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de edição de produto inválidos.',
          errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof BarcodeAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof BarcodeGenerationFailedError) {
      console.error('Error generating product barcode:', error);
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (error instanceof ProductChangedError) {
      return NextResponse.json({ code: 'PRODUCT_CHANGED', message: error.message }, { status: 409 });
    }
    console.error('Error updating product:', error);
    return NextResponse.json({ message: 'Erro interno ao editar produto.' }, { status: 500 });
  }
}
