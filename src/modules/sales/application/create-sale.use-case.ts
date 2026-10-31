import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment, PaymentMethod } from '../domain/payment';
import { SaleRepository } from '../domain/sale-repository.port';
import { ProductRepository } from '@/modules/products/domain/product-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { Product } from '@/modules/products/domain/product';
import { InventoryItem, InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
import { AuditPort } from '@/modules/audit/domain/audit.port';

export class DuplicateSaleRequestError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`Venda duplicada para a chave de idempotência [${idempotencyKey}].`);
    this.name = 'DuplicateSaleRequestError';
  }
}

export class OpenCashSessionRequiredError extends Error {
  constructor() {
    super('Uma sessão de caixa aberta é obrigatória para registrar vendas.');
    this.name = 'OpenCashSessionRequiredError';
  }
}

export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Produto [${productId}] não encontrado.`);
    this.name = 'ProductNotFoundError';
  }
}

export class ProductInactiveError extends Error {
  constructor(public readonly productId: string) {
    super(`Produto [${productId}] está inativo para venda.`);
    this.name = 'ProductInactiveError';
  }
}

export interface CreateSaleItemDTO {
  productId: string;
  quantity: number;
}

export interface CreateSalePaymentDTO {
  method: PaymentMethod;
  amount: Money;
  receivedAmount?: Money;
  installments?: number;
  externalReference?: string | null;
}

export interface CreateSaleDTO {
  merchantId: string;
  operatorId: string;
  items: CreateSaleItemDTO[];
  payments: CreateSalePaymentDTO[];
  discountAmount?: Money;
  discountReason?: string;
  idempotencyKey?: string | null;
}

interface ResolvedProduct {
  product: Product;
  inventoryItem: InventoryItem;
  quantity: number;
}

export class CreateSaleUseCase {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly productRepository: ProductRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly auditPort: AuditPort
  ) {}

  public async execute(dto: CreateSaleDTO): Promise<Sale> {
    await this.checkIdempotency(dto.merchantId, dto.idempotencyKey);

    const openSession = await this.cashSessionRepository.findCurrentOpenSession(dto.merchantId);
    if (!openSession) {
      throw new OpenCashSessionRequiredError();
    }

    if (!dto.items?.length) {
      throw new Error('A venda deve conter pelo menos um item.');
    }
    if (!dto.payments?.length) {
      throw new Error('A venda deve conter pelo menos uma forma de pagamento.');
    }

    const resolvedProducts = await this.resolveAndValidateProducts(dto.merchantId, dto.items);
    const sale = this.buildSale(dto, openSession.id, resolvedProducts);

    await this.deductStock(dto.merchantId, dto.operatorId, sale.id, resolvedProducts);
    await this.recordCashReceipt(dto.merchantId, openSession.id, sale);
    await this.saleRepository.save(sale);
    await this.recordAudit(dto, openSession.id, sale);

    return sale;
  }

  private async checkIdempotency(merchantId: string, idempotencyKey?: string | null): Promise<void> {
    if (!idempotencyKey) return;
    const existing = await this.saleRepository.findByIdempotencyKey(merchantId, idempotencyKey);
    if (existing) {
      throw new DuplicateSaleRequestError(idempotencyKey);
    }
  }

  private async resolveAndValidateProducts(
    merchantId: string,
    items: CreateSaleItemDTO[]
  ): Promise<ResolvedProduct[]> {
    const resolved: ResolvedProduct[] = [];

    for (const item of items) {
      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new Error('Quantidade do item deve ser um número inteiro positivo.');
      }

      const product = await this.productRepository.findById(merchantId, item.productId);
      if (!product) {
        throw new ProductNotFoundError(item.productId);
      }
      if (!product.active) {
        throw new ProductInactiveError(item.productId);
      }

      const inventoryItem = await this.inventoryRepository.findByProductId(merchantId, item.productId);
      if (!inventoryItem || !inventoryItem.hasSufficientStock(item.quantity)) {
        throw new InsufficientStockError(
          item.productId,
          inventoryItem?.availableQuantity ?? 0,
          item.quantity
        );
      }

      resolved.push({ product, inventoryItem, quantity: item.quantity });
    }

    return resolved;
  }

  private buildSale(
    dto: CreateSaleDTO,
    cashSessionId: string,
    resolvedProducts: ResolvedProduct[]
  ): Sale {
    const sale = Sale.create(
      dto.merchantId,
      cashSessionId,
      dto.operatorId,
      { idempotencyKey: dto.idempotencyKey }
    );

    for (const res of resolvedProducts) {
      sale.addItem(
        SaleItem.create(res.product.id, res.product.name, res.product.salePrice, res.quantity)
      );
    }

    if (dto.discountAmount) {
      sale.applyDiscount(dto.discountAmount);
    }

    const paymentEntities = dto.payments.map((p) =>
      Payment.create(p.method, p.amount, {
        receivedAmount: p.receivedAmount,
        installments: p.installments,
        externalReference: p.externalReference,
      })
    );

    sale.confirmPayments(paymentEntities);
    return sale;
  }

  private async deductStock(
    merchantId: string,
    operatorId: string,
    saleId: string,
    resolvedProducts: ResolvedProduct[]
  ): Promise<void> {
    for (const res of resolvedProducts) {
      res.inventoryItem.deduct(res.quantity);
      await this.inventoryRepository.save(res.inventoryItem);
      await this.inventoryRepository.addMovement(
        merchantId,
        res.product.id,
        'SALE',
        res.quantity,
        `Venda ${saleId}`,
        operatorId
      );
    }
  }

  private async recordCashReceipt(
    merchantId: string,
    cashSessionId: string,
    sale: Sale
  ): Promise<void> {
    if (sale.cashPaid.isPositive()) {
      await this.cashSessionRepository.addMovement(
        merchantId,
        cashSessionId,
        'SALE_RECEIPT',
        sale.cashPaid,
        sale.id
      );
    }
  }

  private async recordAudit(
    dto: CreateSaleDTO,
    cashSessionId: string,
    sale: Sale
  ): Promise<void> {
    await this.auditPort.record(
      dto.merchantId,
      'SALE_CONFIRMED',
      dto.operatorId,
      'SALE',
      sale.id,
      {
        cashSessionId,
        subtotal: sale.subtotal.toDecimal(),
        discountAmount: sale.discountAmount.toDecimal(),
        total: sale.total.toDecimal(),
        cashReceived: sale.cashReceived.toDecimal(),
        changeAmount: sale.changeAmount.toDecimal(),
        discountReason: dto.discountReason ?? null,
        itemsCount: sale.items.length,
        payments: sale.payments.map((p) => p.toJSON()),
      }
    );
  }
}
