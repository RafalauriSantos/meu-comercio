import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { FindProductByBarcodeUseCase } from '@/modules/products/application/find-product-by-barcode.use-case';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  try {
    const session = await requireAuthSession();
    const { barcode } = await params;

    const productRepo = new DrizzleProductRepository();
    const inventoryRepo = new DrizzleInventoryRepository();
    const useCase = new FindProductByBarcodeUseCase(productRepo, inventoryRepo);

    const found = await useCase.execute(session.merchantId, barcode);
    if (!found) {
      return NextResponse.json(
        { message: `Produto com código de barras [${barcode}] não encontrado.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: found.product.id,
      barcode: found.product.barcode,
      name: found.product.name,
      salePrice: found.product.salePrice.toDecimal(),
      availableQuantity: found.availableQuantity,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error finding product by barcode:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar produto.' }, { status: 500 });
  }
}
