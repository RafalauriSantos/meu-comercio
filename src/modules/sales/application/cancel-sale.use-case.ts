import { Sale } from '../domain/sale';
import { SaleRepository } from '../domain/sale-repository.port';
import { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
import { OwnerPinVerifier } from '@/modules/customers/domain/owner-pin-verifier.port';
import { CustomerCreditRepository } from '@/modules/customers/domain/customer-credit-repository.port';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import { InvalidOwnerPinError, NoOpenCashSessionError } from '@/modules/customers/domain/errors';

export class SaleNotFoundError extends Error {
  constructor(saleId: string) {
    super(`Venda [${saleId}] não encontrada.`);
    this.name = 'SaleNotFoundError';
  }
}

export class SaleAlreadyCancelledError extends Error {
  constructor(message = 'Venda já se encontra cancelada.') {
    super(message);
    this.name = 'SaleAlreadyCancelledError';
  }
}

export class InsufficientCashForRefundError extends Error {
  constructor(message = 'Dinheiro na gaveta do caixa insuficiente para devolução ao cliente.') {
    super(message);
    this.name = 'InsufficientCashForRefundError';
  }
}

export interface CancelSaleDTO {
  merchantId: string;
  saleId: string;
  operatorId: string;
  ownerPin: string;
  ownerUsername?: string;
  reason: string;
}

export class CancelSaleUseCase {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly ownerPinVerifier: OwnerPinVerifier,
    private readonly auditPort: AuditPort,
    private readonly customerCreditRepository?: CustomerCreditRepository
  ) {}

  async execute(dto: CancelSaleDTO): Promise<Sale> {
    const ownerUsername = dto.ownerUsername ?? 'owner';
    const isPinValid = await this.ownerPinVerifier.verifyOwnerPin(
      dto.merchantId,
      ownerUsername,
      dto.ownerPin
    );
    if (!isPinValid) {
      throw new InvalidOwnerPinError('PIN da proprietária inválido ou não autorizado.');
    }

    const sale = await this.saleRepository.findById(dto.merchantId, dto.saleId);
    if (!sale) {
      throw new SaleNotFoundError(dto.saleId);
    }

    if (sale.isCancelled()) {
      throw new SaleAlreadyCancelledError();
    }

    if (!sale.isConfirmed()) {
      throw new Error('Apenas vendas confirmadas podem ser canceladas.');
    }

    const cashPaid = sale.cashPaid;
    let openSession = null;

    if (cashPaid.isPositive()) {
      openSession = await this.cashSessionRepository.findCurrentOpenSession(dto.merchantId);
      if (!openSession) {
        throw new NoOpenCashSessionError(
          'Sessão de caixa aberta é obrigatória para efetuar o estorno de dinheiro físico.'
        );
      }

      const availableCash = await this.cashSessionRepository.getExpectedCash(
        dto.merchantId,
        openSession.id
      );

      if (cashPaid.greaterThan(availableCash)) {
        throw new InsufficientCashForRefundError(
          `Dinheiro na gaveta insuficiente. Disponível: R$ ${availableCash.toDecimal()}, Reembolso necessário: R$ ${cashPaid.toDecimal()}.`
        );
      }
    }

    // Marca a venda como cancelada
    sale.cancel();
    await this.saleRepository.save(sale);

    // Devolve os itens ao estoque com movimento RETURN
    for (const item of sale.items) {
      const inventoryItem = await this.inventoryRepository.findByProductId(
        dto.merchantId,
        item.productId
      );

      if (inventoryItem) {
        inventoryItem.restock(item.quantity);
        await this.inventoryRepository.save(inventoryItem);
      }

      await this.inventoryRepository.addMovement(
        dto.merchantId,
        item.productId,
        'RETURN',
        item.quantity,
        `Cancelamento da venda ${sale.id}: ${dto.reason}`,
        dto.operatorId
      );
    }

    // Estorna dinheiro físico da gaveta do caixa
    if (cashPaid.isPositive() && openSession) {
      await this.cashSessionRepository.addMovement(
        dto.merchantId,
        openSession.id,
        'CASH_CANCEL',
        cashPaid,
        sale.id
      );
    }

    // Estorna fiado (se houver pagamento do tipo TAB)
    const tabPayment = sale.getTabPayment();
    if (tabPayment?.externalReference && this.customerCreditRepository) {
      const compensationMovement = CreditMovement.create({
        merchantId: dto.merchantId,
        customerId: tabPayment.externalReference,
        type: 'CREDIT',
        amount: tabPayment.amount,
        operatorId: dto.operatorId,
        saleId: sale.id,
        note: `Estorno de venda cancelada ${sale.id}: ${dto.reason}`,
      });
      await this.customerCreditRepository.saveMovement(compensationMovement);
    }

    // Trilha imutável de auditoria
    await this.auditPort.record(
      dto.merchantId,
      'SALE_CANCELLED',
      dto.operatorId,
      'sale',
      sale.id,
      {
        reason: dto.reason,
        total: sale.total.toDecimal(),
        refundedCash: cashPaid.toDecimal(),
      }
    );

    return sale;
  }
}
