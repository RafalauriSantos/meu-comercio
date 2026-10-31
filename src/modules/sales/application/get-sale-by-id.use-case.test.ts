import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment } from '../domain/payment';
import { SaleRepository } from '../domain/sale-repository.port';
import { GetSaleByIdUseCase } from './get-sale-by-id.use-case';

class InMemorySaleRepository implements SaleRepository {
  public sales: Map<string, Sale> = new Map();

  async save(sale: Sale): Promise<void> {
    this.sales.set(`${sale.merchantId}:${sale.id}`, sale);
  }

  async findById(merchantId: string, id: string): Promise<Sale | null> {
    return this.sales.get(`${merchantId}:${id}`) ?? null;
  }

  async findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Sale | null> {
    for (const sale of this.sales.values()) {
      if (sale.merchantId === merchantId && sale.idempotencyKey === idempotencyKey) {
        return sale;
      }
    }
    return null;
  }
}

describe('GetSaleByIdUseCase', () => {
  let saleRepo: InMemorySaleRepository;
  let useCase: GetSaleByIdUseCase;

  const MERCHANT_ID = 'merch-123';
  const SALE_ID = 'sale-abc';

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    useCase = new GetSaleByIdUseCase(saleRepo);
  });

  it('deve retornar a venda encontrada com seus itens e pagamentos', async () => {
    const sale = Sale.create(MERCHANT_ID, 'session-1', 'op-1', { id: SALE_ID });
    sale.addItem(SaleItem.create('prod-1', 'Arroz', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'), { receivedAmount: Money.fromDecimal('10.00') })]);
    await saleRepo.save(sale);

    const result = await useCase.execute(MERCHANT_ID, SALE_ID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(SALE_ID);
    expect(result?.total.toDecimal()).toBe('10.00');
    expect(result?.items).toHaveLength(1);
    expect(result?.payments).toHaveLength(1);
  });

  it('deve retornar null se a venda não for encontrada', async () => {
    const result = await useCase.execute(MERCHANT_ID, 'non-existent-id');
    expect(result).toBeNull();
  });

  it('não deve permitir acesso a venda de outro comerciante (isolamento multi-tenant)', async () => {
    const sale = Sale.create('merch-outra', 'session-1', 'op-1', { id: SALE_ID });
    await saleRepo.save(sale);

    const result = await useCase.execute(MERCHANT_ID, SALE_ID);
    expect(result).toBeNull();
  });
});
