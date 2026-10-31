import { Product } from './product';

export interface ProductRepository {
  save(product: Product): Promise<void>;
  findByBarcode(merchantId: string, barcode: string): Promise<Product | null>;
  findById(merchantId: string, id: string): Promise<Product | null>;
  searchByNameOrBarcode(merchantId: string, query: string, limit?: number): Promise<Product[]>;
}
