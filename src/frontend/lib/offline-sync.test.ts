import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OfflineSyncManager,
  OfflineSale,
  CachedProduct,
  SyncResult,
} from './offline-sync';

// Mock in-memory localStorage for Node test environment
class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe('OfflineSyncManager', () => {
  let storage: Storage;
  let offlineSync: OfflineSyncManager;

  const merchantA = 'merchant-aaa';
  const operatorA = 'caixa-1';
  const merchantB = 'merchant-bbb';
  const operatorB = 'caixa-2';

  beforeEach(() => {
    storage = new MemoryStorage();
    offlineSync = new OfflineSyncManager(storage);
  });

  describe('Formatação de Chaves e Isolamento Multi-tenant e Operador', () => {
    it('deve usar o formato de chave correto para fila offline: miniMarketOfflineSales:${merchantId}:${username}', () => {
      const key = offlineSync.getQueueKey(merchantA, operatorA);
      expect(key).toBe(`miniMarketOfflineSales:${merchantA}:${operatorA}`);
    });

    it('deve isolar filas de vendas offline entre diferentes comerciantes e operadores', () => {
      const saleA: OfflineSale = {
        idempotencyKey: 'idemp-111',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'prod-1', quantity: 2, salePrice: '10.00' }],
        payments: [{ method: 'CASH', amount: '20.00', receivedAmount: '20.00' }],
        createdAt: new Date().toISOString(),
      };

      const saleB: OfflineSale = {
        idempotencyKey: 'idemp-222',
        merchantId: merchantB,
        operatorId: operatorB,
        items: [{ productId: 'prod-2', quantity: 1, salePrice: '15.00' }],
        payments: [{ method: 'CASH', amount: '15.00', receivedAmount: '20.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, saleA);
      offlineSync.enqueueSale(merchantB, operatorB, saleB);

      const queueA = offlineSync.getQueue(merchantA, operatorA);
      const queueB = offlineSync.getQueue(merchantB, operatorB);

      expect(queueA).toHaveLength(1);
      expect(queueA[0].idempotencyKey).toBe('idemp-111');

      expect(queueB).toHaveLength(1);
      expect(queueB[0].idempotencyKey).toBe('idemp-222');
    });
  });

  describe('Enfileiramento Seguro de Vendas Offline', () => {
    it('deve salvar uma venda em dinheiro (CASH) com sucesso na fila offline', () => {
      const sale: OfflineSale = {
        idempotencyKey: 'idemp-cash-1',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [
          { productId: 'prod-1', quantity: 1, name: 'Detergente', salePrice: '3.50' },
        ],
        payments: [{ method: 'CASH', amount: '3.50', receivedAmount: '5.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale);

      const queue = offlineSync.getQueue(merchantA, operatorA);
      expect(queue).toHaveLength(1);
      expect(queue[0].idempotencyKey).toBe('idemp-cash-1');
      expect(queue[0].payments[0].method).toBe('CASH');
    });

    it('deve recusar salvar offline venda que não seja estritamente em dinheiro (CASH)', () => {
      const invalidSale = {
        idempotencyKey: 'idemp-pix-1',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'prod-1', quantity: 1 }],
        payments: [{ method: 'PIX' as const, amount: '25.00' }],
        createdAt: new Date().toISOString(),
      };

      expect(() =>
        offlineSync.enqueueSale(merchantA, operatorA, invalidSale as unknown as OfflineSale)
      ).toThrow('Somente vendas em dinheiro (CASH) podem ser armazenadas offline.');
    });

    it('deve recusar venda sem itens', () => {
      const emptySale: OfflineSale = {
        idempotencyKey: 'idemp-empty',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [],
        payments: [{ method: 'CASH', amount: '10.00' }],
        createdAt: new Date().toISOString(),
      };

      expect(() =>
        offlineSync.enqueueSale(merchantA, operatorA, emptySale)
      ).toThrow('A venda deve conter pelo menos um item.');
    });

    it('deve gerar idempotencyKey automaticamente se omitido', () => {
      const saleWithoutKey = {
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'prod-1', quantity: 1 }],
        payments: [{ method: 'CASH' as const, amount: '10.00' }],
        createdAt: new Date().toISOString(),
      };

      const enqueued = offlineSync.enqueueSale(merchantA, operatorA, saleWithoutKey);
      expect(enqueued.idempotencyKey).toBeDefined();
      expect(typeof enqueued.idempotencyKey).toBe('string');
      expect(enqueued.idempotencyKey.length).toBeGreaterThan(10);
    });

    it('deve lançar erro descritivo se a fila no localStorage contiver JSON corrompido', () => {
      const rawKey = offlineSync.getQueueKey(merchantA, operatorA);
      storage.setItem(rawKey, '{ invalid json corrompido');

      expect(() => offlineSync.getQueue(merchantA, operatorA)).toThrow(
        'A fila de vendas offline está ilegível ou corrompida.'
      );
    });
  });

  describe('Cache de Catálogo de Produtos e Busca Offline por Código de Barras', () => {
    const products: CachedProduct[] = [
      {
        id: 'p-1',
        barcode: '7891000100101',
        name: 'Arroz Branco 5kg',
        salePrice: 24.9,
        availableQuantity: 15,
      },
      {
        id: 'p-2',
        barcode: '7891000200202',
        name: 'Feijão Preto 1kg',
        salePrice: 8.5,
        availableQuantity: 30,
      },
    ];

    it('deve salvar e carregar catálogo de produtos em cache', () => {
      offlineSync.saveProductsCache(merchantA, operatorA, products);

      const cached = offlineSync.getCachedProducts(merchantA, operatorA);
      expect(cached).toHaveLength(2);
      expect(cached[0].name).toBe('Arroz Branco 5kg');
    });

    it('deve encontrar produto em cache offline pelo código de barras exato', () => {
      offlineSync.saveProductsCache(merchantA, operatorA, products);

      const found = offlineSync.findProductByBarcode(
        merchantA,
        operatorA,
        '7891000200202'
      );
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Feijão Preto 1kg');
      expect(found?.salePrice).toBe(8.5);
    });

    it('deve retornar null se o produto não for encontrado no cache offline', () => {
      offlineSync.saveProductsCache(merchantA, operatorA, products);

      const notFound = offlineSync.findProductByBarcode(
        merchantA,
        operatorA,
        '9999999999999'
      );
      expect(notFound).toBeNull();
    });
  });

  describe('Sincronização Automática Idempotente (Replay)', () => {
    it('deve enviar venda com chave de idempotência preservada e remover da fila em sucesso 201', async () => {
      const sale: OfflineSale = {
        idempotencyKey: 'idemp-preserved-123',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-1', quantity: 2, salePrice: '20.00' }],
        payments: [{ method: 'CASH', amount: '40.00', receivedAmount: '50.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale);

      const senderMock = vi.fn().mockResolvedValue({ status: 201 });

      const result: SyncResult = await offlineSync.syncQueue(
        merchantA,
        operatorA,
        senderMock
      );

      expect(senderMock).toHaveBeenCalledTimes(1);
      expect(senderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'idemp-preserved-123',
        })
      );

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.remainingCount).toBe(0);

      // Fila deve estar limpa após sucesso
      const remainingQueue = offlineSync.getQueue(merchantA, operatorA);
      expect(remainingQueue).toHaveLength(0);
    });

    it('deve tratar resposta 409 (Idempotência / Já processado) como sucesso e remover da fila', async () => {
      const sale: OfflineSale = {
        idempotencyKey: 'idemp-duplicate-409',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-1', quantity: 1 }],
        payments: [{ method: 'CASH', amount: '10.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale);

      // Simula que a venda já foi processada anteriormente pelo servidor
      const senderMock = vi.fn().mockResolvedValue({
        status: 409,
        error: 'Venda com esta chave de idempotência já foi processada.',
      });

      const result = await offlineSync.syncQueue(merchantA, operatorA, senderMock);

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      // Não deve permanecer na fila se já foi registrada no banco
      const remainingQueue = offlineSync.getQueue(merchantA, operatorA);
      expect(remainingQueue).toHaveLength(0);
    });

    it('deve interromper sincronização e preservar itens na fila em caso de falha de rede', async () => {
      const sale1: OfflineSale = {
        idempotencyKey: 'idemp-fail-1',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-1', quantity: 1 }],
        payments: [{ method: 'CASH', amount: '10.00' }],
        createdAt: new Date().toISOString(),
      };
      const sale2: OfflineSale = {
        idempotencyKey: 'idemp-fail-2',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-2', quantity: 1 }],
        payments: [{ method: 'CASH', amount: '20.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale1);
      offlineSync.enqueueSale(merchantA, operatorA, sale2);

      // Simula erro de conexão (fetch reject)
      const senderMock = vi.fn().mockRejectedValue(new Error('Failed to fetch / Network disconnected'));

      const result = await offlineSync.syncQueue(merchantA, operatorA, senderMock);

      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.remainingCount).toBe(2);

      // Ambas as vendas devem ser preservadas na fila para tentar novamente
      const remainingQueue = offlineSync.getQueue(merchantA, operatorA);
      expect(remainingQueue).toHaveLength(2);
    });

    it('deve detectar inconsistência de preço/estoque (400) e registrar erro sem travar fila silenciosamente', async () => {
      const sale: OfflineSale = {
        idempotencyKey: 'idemp-stock-error',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-no-stock', quantity: 100 }],
        payments: [{ method: 'CASH', amount: '500.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale);

      const senderMock = vi.fn().mockResolvedValue({
        status: 400,
        error: 'Estoque insuficiente para o produto p-no-stock.',
      });

      const result = await offlineSync.syncQueue(merchantA, operatorA, senderMock);

      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Estoque insuficiente');
      expect(result.errors[0].idempotencyKey).toBe('idemp-stock-error');
    });

    it('deve sincronizar parcialmente com sucesso se houver falha no segundo item', async () => {
      const sale1: OfflineSale = {
        idempotencyKey: 'idemp-success-1',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-1', quantity: 1 }],
        payments: [{ method: 'CASH', amount: '10.00' }],
        createdAt: new Date().toISOString(),
      };
      const sale2: OfflineSale = {
        idempotencyKey: 'idemp-network-fail-2',
        merchantId: merchantA,
        operatorId: operatorA,
        items: [{ productId: 'p-2', quantity: 1 }],
        payments: [{ method: 'CASH', amount: '20.00' }],
        createdAt: new Date().toISOString(),
      };

      offlineSync.enqueueSale(merchantA, operatorA, sale1);
      offlineSync.enqueueSale(merchantA, operatorA, sale2);

      const senderMock = vi
        .fn()
        .mockResolvedValueOnce({ status: 201 })
        .mockRejectedValueOnce(new Error('Network error on second sale'));

      const result = await offlineSync.syncQueue(merchantA, operatorA, senderMock);

      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.remainingCount).toBe(1);

      // Apenas a segunda venda deve restar na fila
      const queue = offlineSync.getQueue(merchantA, operatorA);
      expect(queue).toHaveLength(1);
      expect(queue[0].idempotencyKey).toBe('idemp-network-fail-2');
    });
  });
});
