import { Sale } from '../domain/sale';
import { SaleRepository } from '../domain/sale-repository.port';

export class GetSaleByIdUseCase {
  constructor(private readonly saleRepository: SaleRepository) {}

  public async execute(merchantId: string, saleId: string): Promise<Sale | null> {
    if (!merchantId?.trim() || !saleId?.trim()) {
      return null;
    }
    return this.saleRepository.findById(merchantId.trim(), saleId.trim());
  }
}
