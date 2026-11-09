import { ApiError, type ProductItem } from '@/frontend/lib/api-client';

/**
 * The product that already has this barcode, or null when there is none (or the field is empty).
 * Used while registering a product, so the owner sees at once that a scanned code is taken.
 * Only "not found" is an answer; any other failure is thrown, for the caller to decide.
 */
export async function findProductWithBarcode(
  lookup: (barcode: string) => Promise<ProductItem>,
  barcode: string
): Promise<ProductItem | null> {
  const code = barcode.trim();
  if (!code) return null;
  try {
    return await lookup(code);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function takenBarcodeMessage(product: ProductItem): string {
  return `Este código já está cadastrado: ${product.name}.`;
}
