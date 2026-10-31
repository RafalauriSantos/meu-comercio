import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import {
  CartCalculator,
  CartItem,
  PaymentInput,
} from './cart-calculator';

describe('CartCalculator', () => {
  describe('Cálculo de Subtotal dos Itens do Carrinho', () => {
    it('deve calcular o subtotal de um item com quantidade inteira', () => {
      const item: CartItem = {
        productId: 'prod-1',
        name: 'Arroz 5kg',
        price: Money.fromDecimal('24.90'),
        quantity: 2,
      };

      const itemSubtotal = CartCalculator.calculateItemSubtotal(item);
      expect(itemSubtotal.toDecimal()).toBe('49.80');
      expect(itemSubtotal.toCents()).toBe(4980);
    });

    it('deve calcular o subtotal de item com quantidade decimal (balança/peso)', () => {
      const item: CartItem = {
        productId: 'prod-weight',
        name: 'Queijo Muçarela kg',
        price: Money.fromDecimal('49.90'),
        quantity: 0.354, // 354 gramas
      };

      // 49.90 * 0.354 = 17.6646 -> round half up = 17.66
      const itemSubtotal = CartCalculator.calculateItemSubtotal(item);
      expect(itemSubtotal.toDecimal()).toBe('17.66');
      expect(itemSubtotal.toCents()).toBe(1766);
    });

    it('deve retornar zero quando o carrinho estiver vazio', () => {
      const subtotal = CartCalculator.calculateSubtotal([]);
      expect(subtotal.toDecimal()).toBe('0.00');
      expect(subtotal.isZero()).toBe(true);
    });

    it('deve somar o subtotal de múltiplos itens corretamente', () => {
      const items: CartItem[] = [
        {
          productId: 'prod-1',
          name: 'Feijão Carioca 1kg',
          price: Money.fromDecimal('7.50'),
          quantity: 3, // 22.50
        },
        {
          productId: 'prod-2',
          name: 'Óleo de Soja 900ml',
          price: Money.fromDecimal('6.20'),
          quantity: 2, // 12.40
        },
        {
          productId: 'prod-3',
          name: 'Café Torrado 500g',
          price: Money.fromDecimal('18.99'),
          quantity: 1, // 18.99
        },
      ];

      // 22.50 + 12.40 + 18.99 = 53.89
      const subtotal = CartCalculator.calculateSubtotal(items);
      expect(subtotal.toDecimal()).toBe('53.89');
    });

    it('deve rejeitar item com quantidade menor ou igual a zero', () => {
      const item: CartItem = {
        productId: 'prod-invalid',
        name: 'Item Inválido',
        price: Money.fromDecimal('10.00'),
        quantity: 0,
      };

      expect(() => CartCalculator.calculateItemSubtotal(item)).toThrow(
        'Quantidade do item deve ser maior que zero.'
      );
    });

    it('deve rejeitar item com preço negativo', () => {
      expect(() => {
        const item: CartItem = {
          productId: 'prod-invalid-price',
          name: 'Preço Negativo',
          price: Money.fromDecimal('-5.00'),
          quantity: 1,
        };
        CartCalculator.calculateItemSubtotal(item);
      }).toThrow('Preço do item não pode ser negativo.');
    });
  });

  describe('Cálculo de Desconto e Total Líquido', () => {
    it('deve subtrair o desconto do subtotal resultando no total líquido', () => {
      const subtotal = Money.fromDecimal('100.00');
      const discount = Money.fromDecimal('15.00');

      const total = CartCalculator.calculateTotal(subtotal, discount);
      expect(total.toDecimal()).toBe('85.00');
    });

    it('deve manter o total igual ao subtotal se o desconto for omitido ou zero', () => {
      const subtotal = Money.fromDecimal('50.00');

      expect(CartCalculator.calculateTotal(subtotal).toDecimal()).toBe('50.00');
      expect(CartCalculator.calculateTotal(subtotal, Money.zero()).toDecimal()).toBe('50.00');
    });

    it('deve rejeitar desconto negativo', () => {
      const subtotal = Money.fromDecimal('100.00');
      const negativeDiscount = Money.fromDecimal('-10.00');

      expect(() => CartCalculator.calculateTotal(subtotal, negativeDiscount)).toThrow(
        'Desconto não pode ser negativo.'
      );
    });

    it('deve rejeitar desconto maior que o subtotal da venda', () => {
      const subtotal = Money.fromDecimal('100.00');
      const excessiveDiscount = Money.fromDecimal('100.01');

      expect(() => CartCalculator.calculateTotal(subtotal, excessiveDiscount)).toThrow(
        'Desconto não pode exceder o subtotal da venda.'
      );
    });

    it('deve permitir desconto de 100% (total líquido zero)', () => {
      const subtotal = Money.fromDecimal('50.00');
      const total = CartCalculator.calculateTotal(subtotal, Money.fromDecimal('50.00'));
      expect(total.toDecimal()).toBe('0.00');
      expect(total.isZero()).toBe(true);
    });
  });

  describe('Validação de Pagamentos Simples e Divididos (Split Payments)', () => {
    const totalVenda = Money.fromDecimal('100.00');

    it('deve validar pagamento único em CASH com troco exato', () => {
      const payments: PaymentInput[] = [
        {
          method: 'CASH',
          amount: Money.fromDecimal('100.00'),
          receivedAmount: Money.fromDecimal('120.00'),
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(true);
      expect(validation.isFullyPaid).toBe(true);
      expect(validation.totalPaid.toDecimal()).toBe('100.00');
      expect(validation.remainingAmount.toDecimal()).toBe('0.00');
      expect(validation.changeAmount.toDecimal()).toBe('20.00');
      expect(validation.errors).toHaveLength(0);
    });

    it('deve validar pagamento em split: CASH + PIX com troco apenas do dinheiro', () => {
      const payments: PaymentInput[] = [
        {
          method: 'CASH',
          amount: Money.fromDecimal('40.00'),
          receivedAmount: Money.fromDecimal('50.00'), // troco de 10.00
        },
        {
          method: 'PIX',
          amount: Money.fromDecimal('60.00'),
          receivedAmount: Money.fromDecimal('60.00'),
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(true);
      expect(validation.isFullyPaid).toBe(true);
      expect(validation.totalPaid.toDecimal()).toBe('100.00');
      expect(validation.remainingAmount.toDecimal()).toBe('0.00');
      expect(validation.changeAmount.toDecimal()).toBe('10.00');
      expect(validation.errors).toHaveLength(0);
    });

    it('deve validar pagamento em split 3 vias: DEBIT_CARD + CREDIT_CARD + CASH', () => {
      const payments: PaymentInput[] = [
        {
          method: 'DEBIT_CARD',
          amount: Money.fromDecimal('30.00'),
        },
        {
          method: 'CREDIT_CARD',
          amount: Money.fromDecimal('50.00'),
          installments: 2,
        },
        {
          method: 'CASH',
          amount: Money.fromDecimal('20.00'),
          receivedAmount: Money.fromDecimal('20.00'),
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(true);
      expect(validation.isFullyPaid).toBe(true);
      expect(validation.totalPaid.toDecimal()).toBe('100.00');
      expect(validation.remainingAmount.toDecimal()).toBe('0.00');
      expect(validation.changeAmount.toDecimal()).toBe('0.00');
    });

    it('deve validar pagamento com TAB (fiado/crediário) com identificação do cliente', () => {
      const payments: PaymentInput[] = [
        {
          method: 'CASH',
          amount: Money.fromDecimal('30.00'),
          receivedAmount: Money.fromDecimal('30.00'),
        },
        {
          method: 'TAB',
          amount: Money.fromDecimal('70.00'),
          customerId: 'cust-123',
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(true);
      expect(validation.isFullyPaid).toBe(true);
      expect(validation.totalPaid.toDecimal()).toBe('100.00');
      expect(validation.remainingAmount.toDecimal()).toBe('0.00');
    });

    it('deve recusar pagamento TAB sem customerId', () => {
      const payments: PaymentInput[] = [
        {
          method: 'TAB',
          amount: Money.fromDecimal('100.00'),
          // customerId ausente
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Pagamento via Fiado/Crediário (TAB) exige a seleção de um cliente.'
      );
    });

    it('deve apontar valor restante quando pagamentos não cobrirem o total da venda', () => {
      const payments: PaymentInput[] = [
        {
          method: 'PIX',
          amount: Money.fromDecimal('65.00'),
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.isFullyPaid).toBe(false);
      expect(validation.totalPaid.toDecimal()).toBe('65.00');
      expect(validation.remainingAmount.toDecimal()).toBe('35.00');
      expect(validation.errors).toContain(
        'Valor restante para cobrir o total da venda: R$ 35,00'
      );
    });

    it('deve rejeitar pagamentos que excedam o total líquido da venda', () => {
      const payments: PaymentInput[] = [
        {
          method: 'PIX',
          amount: Money.fromDecimal('60.00'),
        },
        {
          method: 'CREDIT_CARD',
          amount: Money.fromDecimal('50.00'),
        },
      ]; // total = 110.00 > 100.00

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'A soma dos pagamentos (R$ 110,00) não pode exceder o total da venda (R$ 100,00).'
      );
    });

    it('deve rejeitar recebido em dinheiro menor que o valor atribuído ao pagamento', () => {
      const payments: PaymentInput[] = [
        {
          method: 'CASH',
          amount: Money.fromDecimal('50.00'),
          receivedAmount: Money.fromDecimal('40.00'), // menor que 50.00
        },
        {
          method: 'PIX',
          amount: Money.fromDecimal('50.00'),
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Valor recebido em dinheiro (R$ 40,00) é inferior ao valor do pagamento (R$ 50,00).'
      );
    });

    it('deve rejeitar troco para pagamentos eletrônicos (PIX, cartões ou TAB)', () => {
      const payments: PaymentInput[] = [
        {
          method: 'PIX',
          amount: Money.fromDecimal('100.00'),
          receivedAmount: Money.fromDecimal('110.00'), // recebido diferente de amount em pagamento digital
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Pagamentos eletrônicos e fiado não aceitam valor recebido diferente do valor pago.'
      );
    });

    it('deve rejeitar parcelamento para métodos que não sejam cartão de crédito', () => {
      const payments: PaymentInput[] = [
        {
          method: 'DEBIT_CARD',
          amount: Money.fromDecimal('100.00'),
          installments: 3,
        },
      ];

      const validation = CartCalculator.validatePayments(totalVenda, payments);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Parcelamento só é permitido para cartão de crédito.'
      );
    });
  });

  describe('Resumo Consolidado do Carrinho (CartSummary)', () => {
    it('deve produzir o resumo completo do carrinho pronto para exibição e finalização', () => {
      const items: CartItem[] = [
        {
          productId: 'prod-1',
          name: 'Arroz 5kg',
          price: Money.fromDecimal('25.00'),
          quantity: 2, // 50.00
        },
        {
          productId: 'prod-2',
          name: 'Feijão 1kg',
          price: Money.fromDecimal('10.00'),
          quantity: 3, // 30.00
        },
      ];

      const discount = Money.fromDecimal('5.00'); // Subtotal 80.00 -> Total Líquido 75.00

      const payments: PaymentInput[] = [
        {
          method: 'CASH',
          amount: Money.fromDecimal('25.00'),
          receivedAmount: Money.fromDecimal('50.00'), // Troco 25.00
        },
        {
          method: 'PIX',
          amount: Money.fromDecimal('50.00'),
        },
      ];

      const summary = CartCalculator.getSummary(items, payments, discount);

      expect(summary.subtotal.toDecimal()).toBe('80.00');
      expect(summary.discount.toDecimal()).toBe('5.00');
      expect(summary.total.toDecimal()).toBe('75.00');
      expect(summary.totalPaid.toDecimal()).toBe('75.00');
      expect(summary.remainingAmount.toDecimal()).toBe('0.00');
      expect(summary.changeAmount.toDecimal()).toBe('25.00');
      expect(summary.isFullyPaid).toBe(true);
      expect(summary.canFinalize).toBe(true);
      expect(summary.errors).toHaveLength(0);
      expect(summary.itemCount).toBe(5); // 2 + 3
    });

    it('deve impedir finalização se o carrinho estiver vazio', () => {
      const summary = CartCalculator.getSummary([], []);
      expect(summary.canFinalize).toBe(false);
      expect(summary.errors).toContain('O carrinho não possui itens.');
    });
  });
});
