import { Product } from './product';

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

export interface ProductRepository {
  save(product: Product): Promise<void>;
  findByBarcode(merchantId: string, barcode: string): Promise<Product | null>;
  findById(merchantId: string, id: string): Promise<Product | null>;
  searchByNameOrBarcode(merchantId: string, query: string, limit?: number): Promise<Product[]>;
  listPage(merchantId: string, params: ProductListPageParams): Promise<ProductListPage>;
}
