import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import {
  RestockInventoryUseCase,
  ProductNotFoundError,
} from '@/modules/inventory/application/restock-inventory.use-case';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode lançar reposições manuais de estoque.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const productRepo = new DrizzleProductRepository();
    const inventoryRepo = new DrizzleInventoryRepository();
    const auditService = new DrizzleAuditService();
    const useCase = new RestockInventoryUseCase(productRepo, inventoryRepo, auditService);

    const newAvailableQuantity = await useCase.execute(session.merchantId, session.username, body);

    return NextResponse.json({
      success: true,
      newAvailableQuantity,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de reposição de estoque inválidos.',
          errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    console.error('Error restocking inventory:', error);
    return NextResponse.json({ message: 'Erro interno ao repor estoque.' }, { status: 500 });
  }
}
