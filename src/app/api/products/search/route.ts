import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { SearchProductsUseCase } from '@/modules/products/application/search-products.use-case';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const productRepo = new DrizzleProductRepository();
    const inventoryRepo = new DrizzleInventoryRepository();
    const useCase = new SearchProductsUseCase(productRepo, inventoryRepo);

    const items = await useCase.execute(session.merchantId, query);

    return NextResponse.json({
      items: items.map(i => ({
        id: i.product.id,
        barcode: i.product.barcode,
        name: i.product.name,
        salePrice: i.product.salePrice.toDecimal(),
        availableQuantity: i.availableQuantity,
      })),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error searching products:', error);
    return NextResponse.json({ message: 'Erro interno na busca de produtos.' }, { status: 500 });
  }
}
