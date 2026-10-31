export interface OfflineSaleItem {
  productId: string;
  quantity: number;
  barcode?: string;
  name?: string;
  salePrice?: string | number;
}

export interface OfflinePayment {
  method: 'CASH';
  amount: string | number;
  receivedAmount?: string | number;
}

export interface OfflineSale {
  idempotencyKey: string;
  merchantId: string;
  operatorId: string;
  items: OfflineSaleItem[];
  payments: OfflinePayment[];
  discountAmount?: string | number;
  discountReason?: string;
  createdAt: string;
  productSnapshots?: Array<{
    productId: string;
    barcode: string;
    name: string;
    salePrice: string | number;
    quantity: number;
  }>;
}

export interface CachedProduct {
  id: string;
  barcode: string;
  name: string;
  salePrice: number;
  availableQuantity?: number;
  active?: boolean;
}

export interface SyncResult {
  totalProcessed: number;
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
  errors: Array<{ idempotencyKey: string; error: string; status?: number }>;
}

export type OfflineSaleSender = (
  sale: OfflineSale
) => Promise<{ status: number; error?: string } | void>;

export class OfflineSyncManager {
  private readonly storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? this.resolveDefaultStorage();
  }

  private resolveDefaultStorage(): Storage {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      (globalThis as { localStorage?: Storage }).localStorage
    ) {
      return (globalThis as { localStorage: Storage }).localStorage;
    }
    return this.createMemoryStorage();
  }

  private createMemoryStorage(): Storage {
    const memoryMap = new Map<string, string>();
    return {
      get length() {
        return memoryMap.size;
      },
      clear: () => memoryMap.clear(),
      getItem: (k: string) => memoryMap.get(k) ?? null,
      key: (i: number) => Array.from(memoryMap.keys())[i] ?? null,
      removeItem: (k: string) => memoryMap.delete(k),
      setItem: (k: string, v: string) => memoryMap.set(k, String(v)),
    };
  }

  public getQueueKey(merchantId: string, username: string): string {
    return `miniMarketOfflineSales:${merchantId}:${username}`;
  }

  public getProductsKey(merchantId: string, username: string): string {
    return `miniMarketCachedProducts:${merchantId}:${username}`;
  }

  public getQueue(merchantId: string, username: string): OfflineSale[] {
    const key = this.getQueueKey(merchantId, username);
    const raw = this.storage.getItem(key);
    if (!raw || raw === '[]') {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('Conteúdo não é uma lista.');
      }
      return parsed;
    } catch {
      throw new Error('A fila de vendas offline está ilegível ou corrompida.');
    }
  }

  public enqueueSale(
    merchantId: string,
    username: string,
    saleInput: Partial<OfflineSale>
  ): OfflineSale {
    if (!saleInput.items || saleInput.items.length === 0) {
      throw new Error('A venda deve conter pelo menos um item.');
    }

    if (!saleInput.payments || saleInput.payments.length === 0) {
      throw new Error('A venda deve conter pelo menos uma forma de pagamento.');
    }

    const hasNonCash = saleInput.payments.some((p) => p.method !== 'CASH');
    if (hasNonCash) {
      throw new Error('Somente vendas em dinheiro (CASH) podem ser armazenadas offline.');
    }

    const idempotencyKey =
      saleInput.idempotencyKey?.trim() ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    const fullSale: OfflineSale = {
      idempotencyKey,
      merchantId,
      operatorId: username,
      items: saleInput.items,
      payments: saleInput.payments as OfflinePayment[],
      discountAmount: saleInput.discountAmount,
      discountReason: saleInput.discountReason,
      createdAt: saleInput.createdAt || new Date().toISOString(),
      productSnapshots: saleInput.productSnapshots,
    };

    const currentQueue = this.getQueue(merchantId, username);
    const updatedQueue = [...currentQueue, fullSale];
    this.storage.setItem(this.getQueueKey(merchantId, username), JSON.stringify(updatedQueue));

    return fullSale;
  }

  public saveProductsCache(
    merchantId: string,
    username: string,
    products: CachedProduct[]
  ): void {
    const key = this.getProductsKey(merchantId, username);
    this.storage.setItem(key, JSON.stringify(products));
  }

  public getCachedProducts(merchantId: string, username: string): CachedProduct[] {
    const key = this.getProductsKey(merchantId, username);
    const raw = this.storage.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public findProductByBarcode(
    merchantId: string,
    username: string,
    barcode: string
  ): CachedProduct | null {
    const trimmed = barcode?.trim();
    if (!trimmed) return null;

    const products = this.getCachedProducts(merchantId, username);
    return products.find((p) => p.barcode === trimmed) ?? null;
  }

  public async syncQueue(
    merchantId: string,
    username: string,
    sender: OfflineSaleSender
  ): Promise<SyncResult> {
    const queue = this.getQueue(merchantId, username);
    if (queue.length === 0) {
      return {
        totalProcessed: 0,
        syncedCount: 0,
        failedCount: 0,
        remainingCount: 0,
        errors: [],
      };
    }

    const remainingQueue: OfflineSale[] = [];
    let syncedCount = 0;
    let failedCount = 0;
    const errors: Array<{ idempotencyKey: string; error: string; status?: number }> = [];

    let networkAborted = false;

    for (let i = 0; i < queue.length; i++) {
      const sale = queue[i];

      if (networkAborted) {
        remainingQueue.push(sale);
        continue;
      }

      try {
        const response = await sender(sale);
        const status = response && typeof response === 'object' ? response.status : 200;

        if (status === 200 || status === 201 || status === 409) {
          // Venda sincronizada ou idempotentemente já existente
          syncedCount++;
        } else if (status === 400 || status === 422) {
          // Erro de domínio ou inconsistência de preço/estoque
          failedCount++;
          const errorMsg =
            (response && typeof response === 'object' && response.error) ||
            `Erro de validação na venda (status ${status}).`;
          errors.push({
            idempotencyKey: sale.idempotencyKey,
            error: errorMsg,
            status,
          });
          // Não remove venda rejeitada sem revisão, mantém na fila
          remainingQueue.push(sale);
        } else {
          failedCount++;
          errors.push({
            idempotencyKey: sale.idempotencyKey,
            error: `Falha ao sincronizar: resposta com status ${status}`,
            status,
          });
          remainingQueue.push(sale);
        }
      } catch (err: unknown) {
        // Falha de rede / desconexão
        networkAborted = true;
        failedCount++;
        const errMsg = err instanceof Error ? err.message : 'Falha na conexão com o servidor';
        errors.push({
          idempotencyKey: sale.idempotencyKey,
          error: errMsg,
        });
        remainingQueue.push(sale);
      }
    }

    // Atualiza a fila persistida apenas com os itens restantes
    this.storage.setItem(
      this.getQueueKey(merchantId, username),
      JSON.stringify(remainingQueue)
    );

    return {
      totalProcessed: queue.length,
      syncedCount,
      failedCount,
      remainingCount: remainingQueue.length,
      errors,
    };
  }
}

export const defaultOfflineSync = new OfflineSyncManager();
