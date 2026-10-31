import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleRepository } from '../domain/sale-repository.port';
import { Product } from '@/modules/products/domain/product';
import { ProductRepository } from '@/modules/products/domain/product-repository.port';
import { InventoryItem, InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { InventoryRepository, InventoryMovementType } from '@/modules/inventory/domain/inventory-repository.port';
import { CashSession, CashMovementType, applyCashMovement } from '@/modules/cash/domain/cash-session';
import { CashSessionRepository, CurrentCashSessionSummary } from '@/modules/cash/domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CreateSaleUseCase,
  CreateSaleDTO,
  OpenCashSessionRequiredError,
  DuplicateSaleRequestError,
  ProductNotFoundError,
  ProductInactiveError,
} from './create-sale.use-case';

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

class InMemoryProductRepository implements ProductRepository {
  public products: Map<string, Product> = new Map();

  async save(product: Product): Promise<void> {
    this.products.set(`${product.merchantId}:${product.id}`, product);
  }

  async findByBarcode(merchantId: string, barcode: string): Promise<Product | null> {
    for (const p of this.products.values()) {
      if (p.merchantId === merchantId && p.barcode === barcode.trim() && p.active) {
        return p;
      }
    }
    return null;
  }

  async findById(merchantId: string, id: string): Promise<Product | null> {
    return this.products.get(`${merchantId}:${id}`) ?? null;
  }

  async searchByNameOrBarcode(merchantId: string, query: string, limit = 20): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    const results: Product[] = [];
    for (const p of this.products.values()) {
      if (p.merchantId === merchantId && p.active) {
        if (p.barcode.includes(q) || p.name.toLowerCase().includes(q)) {
          results.push(p);
          if (results.length >= limit) break;
        }
      }
    }
    return results;
  }
}

class InMemoryInventoryRepository implements InventoryRepository {
  public items: Map<string, InventoryItem> = new Map();
  public movements: Array<{
    merchantId: string;
    productId: string;
    movementType: InventoryMovementType;
    quantity: number;
    reason: string;
    actorId: string;
  }> = [];

  async findByProductId(merchantId: string, productId: string): Promise<InventoryItem | null> {
    return this.items.get(`${merchantId}:${productId}`) ?? null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(`${item.merchantId}:${item.productId}`, item);
  }

  async addMovement(
    merchantId: string,
    productId: string,
    movementType: InventoryMovementType,
    quantity: number,
    reason: string,
    actorId: string
  ): Promise<void> {
    this.movements.push({ merchantId, productId, movementType, quantity, reason, actorId });
  }

  async getAvailableQuantity(merchantId: string, productId: string): Promise<number> {
    const item = await this.findByProductId(merchantId, productId);
    return item ? item.availableQuantity : 0;
  }
}

class InMemoryCashSessionRepository implements CashSessionRepository {
  public sessions: Map<string, CashSession> = new Map();
  public movements: Array<{
    merchantId: string;
    sessionId: string;
    movementType: CashMovementType;
    amount: Money;
    saleId?: string | null;
  }> = [];

  async findCurrentOpenSession(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    const open = Array.from(this.sessions.values()).find(
      (s) => s.merchantId === merchantId && s.isOpen()
    );
    if (!open) return null;

    const expectedCash = await this.getExpectedCash(merchantId, open.id);
    return {
      id: open.id,
      merchantId: open.merchantId,
      openedBy: open.openedBy,
      openingBalance: open.openingBalance,
      openedAt: open.openedAt,
      expectedCash,
      movementsCount: this.movements.filter((m) => m.sessionId === open.id).length,
    };
  }

  async findSessionById(merchantId: string, sessionId: string): Promise<CashSession | null> {
    const s = this.sessions.get(sessionId);
    return s && s.merchantId === merchantId ? s : null;
  }

  async openSession(session: CashSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async closeSession(
    merchantId: string,
    sessionId: string,
    operatorId: string,
    closingBalance: Money,
    closedAt: Date
  ): Promise<void> {
    const s = await this.findSessionById(merchantId, sessionId);
    if (s && s.isOpen()) {
      s.close(operatorId, closingBalance, closedAt);
    }
  }

  async addMovement(
    merchantId: string,
    sessionId: string,
    movementType: CashMovementType,
    amount: Money,
    saleId?: string | null
  ): Promise<void> {
    this.movements.push({ merchantId, sessionId, movementType, amount, saleId });
  }

  async getExpectedCash(_merchantId: string, sessionId: string): Promise<Money> {
    return this.movements
      .filter((m) => m.sessionId === sessionId)
      .reduce((total, mov) => applyCashMovement(total, mov.movementType, mov.amount), Money.zero());
  }
}

class InMemoryAuditPort implements AuditPort {
  public records: Array<{
    merchantId: string;
    eventType: string;
    actorId: string;
    aggregateType: string;
    aggregateId: string;
    details: Record<string, unknown>;
  }> = [];

  async record(
    merchantId: string,
    eventType: string,
    actorId: string,
    aggregateType: string,
    aggregateId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    this.records.push({ merchantId, eventType, actorId, aggregateType, aggregateId, details });
  }
}

describe('CreateSaleUseCase — Slice 4: Vendas, Checkout e Split Payments', () => {
  let saleRepo: InMemorySaleRepository;
  let productRepo: InMemoryProductRepository;
  let inventoryRepo: InMemoryInventoryRepository;
  let cashRepo: InMemoryCashSessionRepository;
  let auditPort: InMemoryAuditPort;
  let useCase: CreateSaleUseCase;

  const MERCHANT_ID = 'merch-mercado-01';
  const OPERATOR_ID = 'op-tatiane';
  const SESSION_ID = 'cash-session-001';

  let riceProduct: Product;
  let beanProduct: Product;
  let oilProduct: Product;

  beforeEach(async () => {
    saleRepo = new InMemorySaleRepository();
    productRepo = new InMemoryProductRepository();
    inventoryRepo = new InMemoryInventoryRepository();
    cashRepo = new InMemoryCashSessionRepository();
    auditPort = new InMemoryAuditPort();

    useCase = new CreateSaleUseCase(
      saleRepo,
      productRepo,
      inventoryRepo,
      cashRepo,
      auditPort
    );

    // 1. Abrir sessão de caixa para o comerciante
    const openSession = CashSession.create(
      MERCHANT_ID,
      OPERATOR_ID,
      Money.fromDecimal('100.00'),
      SESSION_ID
    );
    await cashRepo.openSession(openSession);

    // 2. Cadastrar produtos e estoque
    riceProduct = Product.create(
      MERCHANT_ID,
      '789111100001',
      'Arroz Branco 5kg',
      Money.fromDecimal('25.50'),
      'prod-arroz'
    );
    await productRepo.save(riceProduct);
    const riceStock = new InventoryItem({
      merchantId: MERCHANT_ID,
      productId: riceProduct.id,
      availableQuantity: 50,
      updatedAt: new Date(),
    });
    await inventoryRepo.save(riceStock);

    beanProduct = Product.create(
      MERCHANT_ID,
      '789111100002',
      'Feijão Carioca 1kg',
      Money.fromDecimal('8.75'),
      'prod-feijao'
    );
    await productRepo.save(beanProduct);
    const beanStock = new InventoryItem({
      merchantId: MERCHANT_ID,
      productId: beanProduct.id,
      availableQuantity: 30,
      updatedAt: new Date(),
    });
    await inventoryRepo.save(beanStock);

    oilProduct = Product.create(
      MERCHANT_ID,
      '789111100003',
      'Óleo de Soja 900ml',
      Money.fromDecimal('6.25'),
      'prod-oleo'
    );
    await productRepo.save(oilProduct);
    const oilStock = new InventoryItem({
      merchantId: MERCHANT_ID,
      productId: oilProduct.id,
      availableQuantity: 10,
      updatedAt: new Date(),
    });
    await inventoryRepo.save(oilStock);
  });

  describe('4.1 Venda simples em dinheiro com cálculo de troco', () => {
    it('deve registrar venda em dinheiro, deduzir estoque, calcular troco e registrar entrada no caixa e auditoria', async () => {
      // 2 Arroz (2 x 25.50 = 51.00) + 1 Feijão (8.75) = R$ 59.75
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [
          { productId: riceProduct.id, quantity: 2 },
          { productId: beanProduct.id, quantity: 1 },
        ],
        payments: [
          {
            method: 'CASH',
            amount: Money.fromDecimal('59.75'),
            receivedAmount: Money.fromDecimal('70.00'),
          },
        ],
      };

      const sale = await useCase.execute(dto);

      expect(sale.id).toBeDefined();
      expect(sale.status).toBe('CONFIRMED');
      expect(sale.cashSessionId).toBe(SESSION_ID);
      expect(sale.operatorId).toBe(OPERATOR_ID);
      expect(sale.subtotal.toDecimal()).toBe('59.75');
      expect(sale.discountAmount.isZero()).toBe(true);
      expect(sale.total.toDecimal()).toBe('59.75');
      expect(sale.cashReceived.toDecimal()).toBe('70.00');
      expect(sale.changeAmount.toDecimal()).toBe('10.25');

      // Estoque deduzido
      const remainingRice = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, riceProduct.id);
      expect(remainingRice).toBe(48); // 50 - 2
      const remainingBean = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, beanProduct.id);
      expect(remainingBean).toBe(29); // 30 - 1

      // Movimentações de estoque registradas com tipo 'SALE'
      expect(inventoryRepo.movements).toHaveLength(2);
      expect(inventoryRepo.movements[0].movementType).toBe('SALE');
      expect(inventoryRepo.movements[0].quantity).toBe(2);
      expect(inventoryRepo.movements[1].movementType).toBe('SALE');
      expect(inventoryRepo.movements[1].quantity).toBe(1);

      // Movimento de entrada no caixa
      expect(cashRepo.movements).toHaveLength(1);
      expect(cashRepo.movements[0].movementType).toBe('SALE_RECEIPT');
      expect(cashRepo.movements[0].amount.toDecimal()).toBe('59.75');
      expect(cashRepo.movements[0].sessionId).toBe(SESSION_ID);
      expect(cashRepo.movements[0].saleId).toBe(sale.id);

      // Venda persistida no repositório
      const savedSale = await saleRepo.findById(MERCHANT_ID, sale.id);
      expect(savedSale).not.toBeNull();
      expect(savedSale?.id).toBe(sale.id);

      // Trilha de auditoria gravada
      expect(auditPort.records).toHaveLength(1);
      const audit = auditPort.records[0];
      expect(audit.eventType).toBe('SALE_CONFIRMED');
      expect(audit.aggregateType).toBe('SALE');
      expect(audit.aggregateId).toBe(sale.id);
      expect(audit.details.total).toBe('59.75');
      expect(audit.details.cashReceived).toBe('70.00');
      expect(audit.details.changeAmount).toBe('10.25');
    });

    it('deve permitir pagamento em dinheiro com valor exato sem troco', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: oilProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'CASH',
            amount: Money.fromDecimal('6.25'),
            receivedAmount: Money.fromDecimal('6.25'),
          },
        ],
      };

      const sale = await useCase.execute(dto);

      expect(sale.total.toDecimal()).toBe('6.25');
      expect(sale.changeAmount.isZero()).toBe(true);
      expect(sale.cashReceived.toDecimal()).toBe('6.25');
    });
  });

  describe('4.2 Venda com split payments (Dividida em Dinheiro + PIX)', () => {
    it('deve confirmar venda com múltiplos pagamentos e registrar apenas a fração em dinheiro no caixa', async () => {
      // 2 Arroz (51.00) + 1 Feijão (8.75) + 1 Óleo (6.25) = 66.00
      // Split: R$ 36,00 no PIX + R$ 30,00 no Dinheiro (recebeu R$ 50,00 -> troco R$ 20,00)
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [
          { productId: riceProduct.id, quantity: 2 },
          { productId: beanProduct.id, quantity: 1 },
          { productId: oilProduct.id, quantity: 1 },
        ],
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('36.00'),
          },
          {
            method: 'CASH',
            amount: Money.fromDecimal('30.00'),
            receivedAmount: Money.fromDecimal('50.00'),
          },
        ],
      };

      const sale = await useCase.execute(dto);

      expect(sale.status).toBe('CONFIRMED');
      expect(sale.total.toDecimal()).toBe('66.00');
      expect(sale.payments).toHaveLength(2);
      expect(sale.changeAmount.toDecimal()).toBe('20.00');

      // Caixa deve receber APENAS o valor do pagamento em dinheiro (R$ 30,00)
      expect(cashRepo.movements).toHaveLength(1);
      expect(cashRepo.movements[0].movementType).toBe('SALE_RECEIPT');
      expect(cashRepo.movements[0].amount.toDecimal()).toBe('30.00');

      // Auditoria com os 2 pagamentos
      expect(auditPort.records).toHaveLength(1);
      const audit = auditPort.records[0];
      const paymentsDetails = audit.details.payments as Array<{ method: string; amount: string }>;
      expect(paymentsDetails).toHaveLength(2);
      expect(paymentsDetails[0].method).toBe('PIX');
      expect(paymentsDetails[0].amount).toBe('36.00');
      expect(paymentsDetails[1].method).toBe('CASH');
      expect(paymentsDetails[1].amount).toBe('30.00');
    });

    it('deve suportar divisão em 4 métodos diferentes (CASH, PIX, DEBIT_CARD, CREDIT_CARD)', async () => {
      // 4 Arroz = R$ 102.00
      // Split: CASH (25.50), PIX (25.50), DEBIT_CARD (25.50), CREDIT_CARD (25.50 em 2x)
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 4 }],
        payments: [
          {
            method: 'CASH',
            amount: Money.fromDecimal('25.50'),
            receivedAmount: Money.fromDecimal('30.00'),
          },
          {
            method: 'PIX',
            amount: Money.fromDecimal('25.50'),
          },
          {
            method: 'DEBIT_CARD',
            amount: Money.fromDecimal('25.50'),
          },
          {
            method: 'CREDIT_CARD',
            amount: Money.fromDecimal('25.50'),
            installments: 2,
          },
        ],
      };

      const sale = await useCase.execute(dto);

      expect(sale.total.toDecimal()).toBe('102.00');
      expect(sale.payments).toHaveLength(4);
      expect(sale.changeAmount.toDecimal()).toBe('4.50');

      const creditPayment = sale.payments.find((p) => p.method === 'CREDIT_CARD');
      expect(creditPayment?.installments).toBe(2);
    });
  });

  describe('4.3 Rejeição de discrepância de pagamentos', () => {
    it('deve rejeitar venda quando a soma dos pagamentos for menor que o total da venda', async () => {
      // Total R$ 25.50, mas pagou apenas R$ 20.00
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('20.00'),
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        /A soma dos pagamentos \(20.00\) deve ser exatamente igual ao total da venda \(25.50\)/
      );

      // Garantir integridade: nada foi salvo e nenhum estoque foi debitado
      expect(saleRepo.sales.size).toBe(0);
      const stock = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, riceProduct.id);
      expect(stock).toBe(50);
    });

    it('deve rejeitar venda quando a soma dos pagamentos for maior que o total da venda', async () => {
      // Total R$ 25.50, mas informou pagamento de R$ 30.00 no cartão
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'DEBIT_CARD',
            amount: Money.fromDecimal('30.00'),
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        /A soma dos pagamentos \(30.00\) deve ser exatamente igual ao total da venda \(25.50\)/
      );
    });

    it('deve rejeitar pagamento em dinheiro quando o valor recebido for menor que o valor do pagamento', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'CASH',
            amount: Money.fromDecimal('25.50'),
            receivedAmount: Money.fromDecimal('20.00'),
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'Valor recebido em dinheiro é inferior ao valor do pagamento.'
      );
    });
  });

  describe('4.4 Rejeição quando NÃO houver caixa aberto (OpenCashSessionRequiredError)', () => {
    it('deve lançar OpenCashSessionRequiredError quando nenhuma sessão de caixa estiver aberta', async () => {
      // Fechar a sessão atual
      await cashRepo.closeSession(
        MERCHANT_ID,
        SESSION_ID,
        OPERATOR_ID,
        Money.fromDecimal('100.00'),
        new Date()
      );

      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('25.50'),
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(OpenCashSessionRequiredError);

      // Verificação de segurança: nenhuma baixa de estoque ou venda gravada
      expect(saleRepo.sales.size).toBe(0);
      const stock = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, riceProduct.id);
      expect(stock).toBe(50);
      expect(auditPort.records).toHaveLength(0);
    });
  });

  describe('4.5 Rejeição de estoque insuficiente (InsufficientStockError)', () => {
    it('deve lançar InsufficientStockError e garantir que nenhum item do carrinho teve o estoque debitado', async () => {
      // Estoque de Óleo é 10. Tentamos comprar 1 Arroz (50 disp) e 12 Óleos (10 disp)
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [
          { productId: riceProduct.id, quantity: 1 },
          { productId: oilProduct.id, quantity: 12 },
        ],
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('100.50'),
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(InsufficientStockError);

      // Garantir atomicidade: o arroz não deve ter sido baixado
      const riceStock = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, riceProduct.id);
      expect(riceStock).toBe(50);
      const oilStock = await inventoryRepo.getAvailableQuantity(MERCHANT_ID, oilProduct.id);
      expect(oilStock).toBe(10);

      expect(inventoryRepo.movements).toHaveLength(0);
      expect(saleRepo.sales.size).toBe(0);
      expect(cashRepo.movements).toHaveLength(0);
    });
  });

  describe('4.6 Rejeição de chave de idempotência duplicada (DuplicateSaleRequestError)', () => {
    it('deve lançar DuplicateSaleRequestError se requisição concorrente tentar usar a mesma idempotencyKey', async () => {
      const IDEMPOTENCY_KEY = 'req-unique-uuid-999';

      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('25.50'),
          },
        ],
      };

      // Primeira execução com sucesso
      const firstSale = await useCase.execute(dto);
      expect(firstSale.status).toBe('CONFIRMED');

      // Segunda execução idêntica
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(DuplicateSaleRequestError);

      // Apenas 1 venda salva no repositório
      expect(saleRepo.sales.size).toBe(1);
    });

    it('não deve conflitar a mesma chave de idempotência entre comerciantes diferentes', async () => {
      const OTHER_MERCHANT = 'merch-outro-99';
      // Abrir caixa no outro merchant
      const otherSession = CashSession.create(
        OTHER_MERCHANT,
        'op-other',
        Money.fromDecimal('50.00'),
        'cash-session-other'
      );
      await cashRepo.openSession(otherSession);

      // Criar produto no outro merchant
      const otherRice = Product.create(
        OTHER_MERCHANT,
        '789111100001',
        'Arroz Outro Comércio',
        Money.fromDecimal('25.50'),
        'prod-arroz-other'
      );
      await productRepo.save(otherRice);
      await inventoryRepo.save(
        new InventoryItem({
          merchantId: OTHER_MERCHANT,
          productId: otherRice.id,
          availableQuantity: 20,
          updatedAt: new Date(),
        })
      );

      const SHARED_KEY = 'same-client-side-key-123';

      const dto1: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        idempotencyKey: SHARED_KEY,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      const dto2: CreateSaleDTO = {
        merchantId: OTHER_MERCHANT,
        operatorId: 'op-other',
        idempotencyKey: SHARED_KEY,
        items: [{ productId: otherRice.id, quantity: 1 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      const sale1 = await useCase.execute(dto1);
      const sale2 = await useCase.execute(dto2);

      expect(sale1.merchantId).toBe(MERCHANT_ID);
      expect(sale2.merchantId).toBe(OTHER_MERCHANT);
      expect(saleRepo.sales.size).toBe(2);
    });
  });

  describe('4.7 Rejeição de produtos inexistentes e inativos', () => {
    it('deve lançar ProductNotFoundError para produto que não existe no repositório', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: 'non-existent-product-id', quantity: 1 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('10.00') }],
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(ProductNotFoundError);
    });

    it('deve lançar ProductInactiveError para produto desativado', async () => {
      const inactiveProduct = new Product({
        id: 'prod-inativo',
        merchantId: MERCHANT_ID,
        barcode: '789999999999',
        name: 'Produto Desativado',
        salePrice: Money.fromDecimal('15.00'),
        active: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await productRepo.save(inactiveProduct);

      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: inactiveProduct.id, quantity: 1 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('15.00') }],
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(ProductInactiveError);
    });
  });

  describe('4.8 Aplicação de descontos e validações', () => {
    it('deve aplicar desconto válido e abater corretamente do total da venda', async () => {
      // 2 Arroz = R$ 51.00. Desconto: R$ 6.00. Total esperado: R$ 45.00
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 2 }],
        discountAmount: Money.fromDecimal('6.00'),
        discountReason: 'Promoção de aniversário do bairro',
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('45.00'),
          },
        ],
      };

      const sale = await useCase.execute(dto);

      expect(sale.subtotal.toDecimal()).toBe('51.00');
      expect(sale.discountAmount.toDecimal()).toBe('6.00');
      expect(sale.total.toDecimal()).toBe('45.00');

      // Auditoria deve conter motivo do desconto
      const audit = auditPort.records[0];
      expect(audit.details.discountAmount).toBe('6.00');
      expect(audit.details.discountReason).toBe('Promoção de aniversário do bairro');
    });

    it('deve rejeitar desconto maior que o subtotal da venda', async () => {
      // Subtotal R$ 25.50, desconto R$ 30.00
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        discountAmount: Money.fromDecimal('30.00'),
        payments: [{ method: 'PIX', amount: Money.zero() }],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'Desconto não pode exceder o subtotal da venda.'
      );
    });

    it('deve rejeitar desconto com valor negativo', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        discountAmount: Money.fromCents(-500),
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'Desconto não pode ser negativo.'
      );
    });
  });

  describe('4.9 Movimentação no Caixa: Apenas para componente CASH', () => {
    it('NÃO deve lançar movimentação no caixa se o pagamento for 100% digital (PIX)', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: beanProduct.id, quantity: 2 }], // 17.50
        payments: [
          {
            method: 'PIX',
            amount: Money.fromDecimal('17.50'),
          },
        ],
      };

      await useCase.execute(dto);

      // Caixa físico NÃO recebe movimento
      expect(cashRepo.movements).toHaveLength(0);
    });

    it('NÃO deve lançar movimentação no caixa se o pagamento for com cartão de débito/crédito', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: beanProduct.id, quantity: 2 }], // 17.50
        payments: [
          {
            method: 'DEBIT_CARD',
            amount: Money.fromDecimal('17.50'),
          },
        ],
      };

      await useCase.execute(dto);

      expect(cashRepo.movements).toHaveLength(0);
    });
  });

  describe('4.10 Validações estruturais e de integridade da requisição', () => {
    it('deve rejeitar venda sem itens', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('10.00') }],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'A venda deve conter pelo menos um item.'
      );
    });

    it('deve rejeitar venda sem pagamentos', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'A venda deve conter pelo menos uma forma de pagamento.'
      );
    });

    it('deve rejeitar item com quantidade zero ou negativa', async () => {
      const dtoZero: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 0 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      await expect(useCase.execute(dtoZero)).rejects.toThrow(
        'Quantidade do item deve ser um número inteiro positivo.'
      );

      const dtoNeg: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: -2 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      await expect(useCase.execute(dtoNeg)).rejects.toThrow(
        'Quantidade do item deve ser um número inteiro positivo.'
      );
    });

    it('deve rejeitar item com quantidade decimal fracionada', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1.5 }],
        payments: [{ method: 'PIX', amount: Money.fromDecimal('25.50') }],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'Quantidade do item deve ser um número inteiro positivo.'
      );
    });

    it('deve rejeitar parcelamento para pagamentos não permitidos (ex: Débito em 2x)', async () => {
      const dto: CreateSaleDTO = {
        merchantId: MERCHANT_ID,
        operatorId: OPERATOR_ID,
        items: [{ productId: riceProduct.id, quantity: 1 }],
        payments: [
          {
            method: 'DEBIT_CARD',
            amount: Money.fromDecimal('25.50'),
            installments: 2,
          },
        ],
      };

      await expect(useCase.execute(dto)).rejects.toThrow(
        'Parcelamento só é permitido para pagamento com cartão de crédito.'
      );
    });
  });
});
