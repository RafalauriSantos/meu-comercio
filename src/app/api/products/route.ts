import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  CreateProductUseCase,
  BarcodeAlreadyExistsError,
} from '@/modules/products/application/create-product.use-case';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode cadastrar novos produtos no catálogo.' },
        { status: 403 }
      );
    }

    const body = await request.json();
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
