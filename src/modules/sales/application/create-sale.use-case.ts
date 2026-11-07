import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment, PaymentMethod } from '../domain/payment';
import { AuditEntry, CreditDebitCommit, SaleRepository } from '../domain/sale-repository.port';
import { ProductRepository } from '@/modules/products/domain/product-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { Product } from '@/modules/products/domain/product';
import { InventoryItem, InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
import { CustomerRepository } from '@/modules/customers/domain/customer-repository.port';
import { CustomerCreditRepository } from '@/modules/customers/domain/customer-credit-repository.port';
import { OwnerPinVerifier } from '@/modules/customers/domain/owner-pin-verifier.port';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { Customer } from '@/modules/customers/domain/customer';
import {
  CustomerNotFoundError,
  CreditLimitExceededError,
  InvalidOwnerPinError,
} from '@/modules/customers/domain/errors';

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
  ownerPin?: string;
  ownerUsername?: string;
}

export interface CreditSaleDependencies {
  customerRepository: CustomerRepository;
  customerCreditRepository: CustomerCreditRepository;
  ownerPinVerifier: OwnerPinVerifier;
}

interface CreditAuthorization {
  customerId: string;
  customer: Customer;
  amount: Money;
  limitAuthorized: boolean;
  authorizedBy: string | null;
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
    private readonly creditDeps?: CreditSaleDependencies
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

    // Products and stock are validated first, so an invalid sale never spends an owner PIN attempt.
    const resolvedProducts = await this.resolveAndValidateProducts(dto.merchantId, dto.items);
    const credit = await this.authorizeCreditPayment(dto);
    const sale = this.buildSale(dto, openSession.id, resolvedProducts);

    const audits: AuditEntry[] = [this.saleConfirmedAudit(dto, openSession.id, sale)];
    if (credit?.limitAuthorized) {
      audits.push(this.creditLimitAudit(dto, sale, credit));
    }

    await this.saleRepository.commitSale({
      sale,
      actorId: dto.operatorId,
      stockDeductions: resolvedProducts.map((r) => ({ productId: r.product.id, quantity: r.quantity })),
      creditDebit: credit ? this.creditDebitCommit(dto, openSession.id, sale, credit) : undefined,
      cashReceipt: sale.cashPaid.isPositive()
        ? { cashSessionId: openSession.id, amount: sale.cashPaid }
        : undefined,
      audits,
    });

    return sale;
  }

  private async authorizeCreditPayment(dto: CreateSaleDTO): Promise<CreditAuthorization | null> {
    const tabPayments = dto.payments.filter((p) => p.method === 'TAB');
    if (tabPayments.length === 0) {
      return null;
    }
    if (tabPayments.length > 1) {
      throw new Error('A venda pode ter apenas um pagamento fiado.');
    }
    if (!this.creditDeps) {
      throw new Error('Módulo de crédito não configurado.');
    }

    const tab = tabPayments[0];
    const customerId = tab.externalReference;
    if (!customerId) {
      throw new Error('Cliente é obrigatório para venda fiado.');
    }

    const { customerRepository, customerCreditRepository, ownerPinVerifier } = this.creditDeps;
    const customer = await customerRepository.findById(dto.merchantId, customerId);
    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }
    customer.ensureActive();

    const balance = await customerCreditRepository.getBalance(dto.merchantId, customerId);
    const exceedsLimit = customer.wouldExceedCreditLimit(balance.currentDebt, tab.amount);

    let authorizedBy: string | null = null;
    if (exceedsLimit) {
      if (!dto.ownerPin) {
        throw new CreditLimitExceededError();
      }
      authorizedBy = await ownerPinVerifier.authorizeOwnerPin(
        dto.merchantId,
        dto.ownerUsername ?? '',
        dto.ownerPin
      );
      if (authorizedBy === null) {
        throw new InvalidOwnerPinError();
      }
    }

    return { customerId, customer, amount: tab.amount, limitAuthorized: exceedsLimit, authorizedBy };
  }

  private creditDebitCommit(
    dto: CreateSaleDTO,
    cashSessionId: string,
    sale: Sale,
    credit: CreditAuthorization
  ): CreditDebitCommit {
    const movement = CreditMovement.create({
      merchantId: dto.merchantId,
      customerId: credit.customerId,
      type: 'DEBIT',
      amount: credit.amount,
      operatorId: dto.operatorId,
      authorizedBy: credit.authorizedBy,
      saleId: sale.id,
      cashSessionId,
      note: 'Venda fiado',
    });
    return {
      customerId: credit.customerId,
      movement,
      ensureWithinLimit: (currentDebt) => {
        if (!credit.limitAuthorized && credit.customer.wouldExceedCreditLimit(currentDebt, credit.amount)) {
          throw new CreditLimitExceededError();
        }
      },
    };
  }

  private creditLimitAudit(dto: CreateSaleDTO, sale: Sale, credit: CreditAuthorization): AuditEntry {
    return {
      eventType: 'CREDIT_SALE_LIMIT_AUTHORIZED',
      actorId: dto.operatorId,
      aggregateType: 'CUSTOMER',
      aggregateId: credit.customerId,
      details: {
        saleAmount: credit.amount.toDecimal(),
        saleId: sale.id,
        authorizedBy: credit.authorizedBy,
      },
    };
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

  private saleConfirmedAudit(dto: CreateSaleDTO, cashSessionId: string, sale: Sale): AuditEntry {
    return {
      eventType: 'SALE_CONFIRMED',
      actorId: dto.operatorId,
      aggregateType: 'SALE',
      aggregateId: sale.id,
      details: {
        cashSessionId,
        subtotal: sale.subtotal.toDecimal(),
        discountAmount: sale.discountAmount.toDecimal(),
        total: sale.total.toDecimal(),
        cashReceived: sale.cashReceived.toDecimal(),
        changeAmount: sale.changeAmount.toDecimal(),
        discountReason: dto.discountReason ?? null,
        itemsCount: sale.items.length,
        payments: sale.payments.map((p) => p.toJSON()),
      },
    };
  }
}
