import { Product } from './product';
import { Money } from '@/shared/domain/money';

export interface ProductListPageParams {
  query: string;
  page: number;
  pageSize: number;
}

export interface ProductListItem {
  product: Product;
  availableQuantity: number;
}

export interface ProductListPage {
  items: ProductListItem[];
  hasMore: boolean;
}

/** Over the active products. A product without a stock row counts as quantity 0. */
export interface ProductsSummary {
  total: number;
  /** Low or out of stock (the "needs restock" number on the screen). */
  lowStockCount: number;
  outOfStockCount: number;
  /** At sale price; negative quantities add nothing; KG lines are rounded to the cent. */
  stockValue: Money;
}

export interface ProductRepository {
  save(product: Product): Promise<void>;
  findByBarcode(merchantId: string, barcode: string): Promise<Product | null>;
  findById(merchantId: string, id: string): Promise<Product | null>;
  searchByNameOrBarcode(merchantId: string, query: string, limit?: number): Promise<Product[]>;
  listPage(merchantId: string, params: ProductListPageParams): Promise<ProductListPage>;
  getSummary(merchantId: string): Promise<ProductsSummary>;
}
