import { Sale } from './sale';

export interface SaleRepository {
  save(sale: Sale): Promise<void>;
  findById(merchantId: string, id: string): Promise<Sale | null>;
  findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null>;
}
