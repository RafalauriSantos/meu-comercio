import { Sale } from '../domain/sale';
import { SaleRepository } from '../domain/sale-repository.port';
import { CashSessionNotOpenError, SaleAlreadyCancelledError } from '../domain/errors';
import { CashSessionRepository } from '@/modules/cash/domain/cash-session-repository.port';
import { OwnerPinVerifier } from '@/modules/customers/domain/owner-pin-verifier.port';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { InvalidOwnerPinError, NoOpenCashSessionError } from '@/modules/customers/domain/errors';

export { SaleAlreadyCancelledError };

export class SaleNotFoundError extends Error {
  constructor(saleId: string) {
    super(`Venda [${saleId}] não encontrada.`);
    this.name = 'SaleNotFoundError';
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
    private readonly cashSessionRepository: CashSessionRepository,
    private readonly ownerPinVerifier: OwnerPinVerifier
  ) {}

  async execute(dto: CancelSaleDTO): Promise<Sale> {
    const isPinValid = await this.ownerPinVerifier.verifyOwnerPin(
      dto.merchantId,
      dto.ownerUsername ?? '',
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

    sale.cancel();

    // Devolve os itens ao estoque (RETURN), mas só se a venda os tirou de lá: uma venda feita
    // com o controle de estoque desligado não tirou nada, e devolver inflaria o estoque.
    const stockReturns = (sale.stockTracked ? sale.items : []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      reason: `Cancelamento da venda ${sale.id}: ${dto.reason}`,
    }));

    // Estorno de fiado (se houver pagamento do tipo TAB)
    const tabPayment = sale.getTabPayment();
    const creditRefund = tabPayment?.externalReference
      ? {
          customerId: tabPayment.externalReference,
          movement: CreditMovement.create({
            merchantId: dto.merchantId,
            customerId: tabPayment.externalReference,
            type: 'CREDIT',
            amount: tabPayment.amount,
            operatorId: dto.operatorId,
            saleId: sale.id,
            note: `Estorno de venda cancelada ${sale.id}: ${dto.reason}`,
          }),
        }
      : undefined;

    try {
      await this.saleRepository.commitCancellation({
        sale,
        actorId: dto.operatorId,
        stockReturns,
        cashRefund: openSession ? { cashSessionId: openSession.id, amount: cashPaid } : undefined,
        creditRefund,
        audits: [
          {
            eventType: 'SALE_CANCELLED',
            actorId: dto.operatorId,
            aggregateType: 'sale',
            aggregateId: sale.id,
            details: {
              reason: dto.reason,
              total: sale.total.toDecimal(),
              refundedCash: cashPaid.toDecimal(),
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof CashSessionNotOpenError) {
        throw new NoOpenCashSessionError(
          'Sessão de caixa aberta é obrigatória para efetuar o estorno de dinheiro físico.'
        );
      }
      throw error;
    }

    return sale;
  }
}
