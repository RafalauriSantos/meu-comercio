import { Money } from '@/shared/domain/money';

export type PaymentMethod = 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'TAB';

export interface CartItem {
  productId: string;
  name?: string;
  price: Money;
  quantity: number;
}

export interface PaymentInput {
  id?: string;
  method: PaymentMethod;
  amount: Money;
  receivedAmount?: Money;
  installments?: number;
  customerId?: string;
  ownerPin?: string;
  externalReference?: string | null;
}

export interface PaymentValidationResult {
  isValid: boolean;
  isFullyPaid: boolean;
  totalPaid: Money;
  remainingAmount: Money;
  changeAmount: Money;
  errors: string[];
}

export interface CartSummary {
  subtotal: Money;
  discount: Money;
  total: Money;
  totalPaid: Money;
  remainingAmount: Money;
  changeAmount: Money;
  isFullyPaid: boolean;
  canFinalize: boolean;
  errors: string[];
  itemCount: number;
}

export class CartCalculator {
  public static calculateItemSubtotal(item: CartItem): Money {
    if (item.quantity <= 0) {
      throw new Error('Quantidade do item deve ser maior que zero.');
    }
    if (item.price.isNegative()) {
      throw new Error('Preço do item não pode ser negativo.');
    }
    return item.price.multiply(item.quantity);
  }

  public static calculateSubtotal(items: CartItem[]): Money {
    if (!items || items.length === 0) {
      return Money.zero();
    }
    return items.reduce((acc, item) => {
      return acc.add(this.calculateItemSubtotal(item));
    }, Money.zero());
  }

  public static calculateTotal(subtotal: Money, discount?: Money): Money {
    const disc = discount ?? Money.zero(subtotal.currency);
    if (disc.isNegative()) {
      throw new Error('Desconto não pode ser negativo.');
    }
    if (disc.greaterThan(subtotal)) {
      throw new Error('Desconto não pode exceder o subtotal da venda.');
    }
    return subtotal.subtract(disc);
  }

  public static validatePayments(
    total: Money,
    payments: PaymentInput[]
  ): PaymentValidationResult {
    const errors: string[] = [];
    let totalPaid = Money.zero(total.currency);
    let totalChange = Money.zero(total.currency);

    if (total.isNegative()) {
      errors.push('Total da venda não pode ser negativo.');
    }

    for (const payment of payments) {
      if (payment.amount.isNegative() || payment.amount.isZero()) {
        errors.push(`O valor do pagamento para o método ${payment.method} deve ser maior que zero.`);
        continue;
      }

      totalPaid = totalPaid.add(payment.amount);

      if (payment.method === 'CASH') {
        const received = payment.receivedAmount ?? payment.amount;
        if (received.lessThan(payment.amount)) {
          errors.push(
            `Valor recebido em dinheiro (${received.formatBrl()}) é inferior ao valor do pagamento (${payment.amount.formatBrl()}).`
          );
        } else {
          totalChange = totalChange.add(received.subtract(payment.amount));
        }
      } else {
        if (payment.receivedAmount && !payment.receivedAmount.equals(payment.amount)) {
          errors.push('Pagamentos eletrônicos e fiado não aceitam valor recebido diferente do valor pago.');
        }

        if (payment.installments && payment.installments > 1 && payment.method !== 'CREDIT_CARD') {
          errors.push('Parcelamento só é permitido para cartão de crédito.');
        }

        if (payment.method === 'TAB') {
          if (!payment.customerId?.trim()) {
            errors.push('Pagamento via Fiado/Crediário (TAB) exige a seleção de um cliente.');
          }
        }
      }
    }

    if (totalPaid.greaterThan(total)) {
      errors.push(
        `A soma dos pagamentos (${totalPaid.formatBrl()}) não pode exceder o total da venda (${total.formatBrl()}).`
      );
    }

    const remainingAmount = total.greaterThan(totalPaid)
      ? total.subtract(totalPaid)
      : Money.zero(total.currency);

    const isFullyPaid = totalPaid.equals(total);

    if (!isFullyPaid && totalPaid.lessThan(total)) {
      errors.push(`Valor restante para cobrir o total da venda: ${remainingAmount.formatBrl()}`);
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      isFullyPaid,
      totalPaid,
      remainingAmount,
      changeAmount: totalChange,
      errors,
    };
  }

  public static getSummary(
    items: CartItem[],
    payments: PaymentInput[],
    discount?: Money
  ): CartSummary {
    const errors: string[] = [];
    let subtotal = Money.zero();
    let total = Money.zero();
    const effectiveDiscount = discount ?? Money.zero();

    if (!items || items.length === 0) {
      errors.push('O carrinho não possui itens.');
    } else {
      try {
        subtotal = this.calculateSubtotal(items);
        total = this.calculateTotal(subtotal, effectiveDiscount);
      } catch (err: unknown) {
        if (err instanceof Error) {
          errors.push(err.message);
        }
      }
    }

    const paymentValidation = this.validatePayments(total, payments);
    if (!paymentValidation.isValid) {
      errors.push(...paymentValidation.errors);
    }

    const canFinalize =
      items.length > 0 &&
      errors.length === 0 &&
      paymentValidation.isFullyPaid;

    const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

    return {
      subtotal,
      discount: effectiveDiscount,
      total,
      totalPaid: paymentValidation.totalPaid,
      remainingAmount: paymentValidation.remainingAmount,
      changeAmount: paymentValidation.changeAmount,
      isFullyPaid: paymentValidation.isFullyPaid,
      canFinalize,
      errors,
      itemCount,
    };
  }
}
