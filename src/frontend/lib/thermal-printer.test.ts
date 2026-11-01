import { describe, it, expect } from 'vitest';
import {
  formatSaleReceipt,
  formatCreditNote,
  ThermalSaleReceiptData,
  ThermalCreditNoteData,
} from './thermal-printer';

describe('Gerador de Cupom Térmico (thermal-printer)', () => {
  const storeInfo = {
    name: 'Mercadinho do Bairro',
    phone: '(11) 98888-7777',
    cnpj: '12.345.678/0001-90',
    address: 'Rua das Flores, 123',
  };

  const sampleSale: ThermalSaleReceiptData = {
    store: storeInfo,
    saleId: 'sale-987654321',
    date: '2026-11-01 10:30:00',
    operatorName: 'Maria Caixa',
    items: [
      { name: 'Arroz Tio João 5kg', quantity: 2, unitPrice: '25,00', subtotal: '50,00' },
      { name: 'Feijão Carioca 1kg', quantity: 1, unitPrice: '8,50', subtotal: '8,50' },
      { name: 'Óleo de Soja 900ml', quantity: 3, unitPrice: '6,00', subtotal: '18,00' },
    ],
    subtotal: '76,50',
    discount: '6,50',
    total: '70,00',
    payments: [
      {
        method: 'Dinheiro',
        amount: '70,00',
        receivedAmount: '100,00',
        changeAmount: '30,00',
      },
    ],
  };

  const sampleCreditNote: ThermalCreditNoteData = {
    store: storeInfo,
    saleId: 'sale-fiado-456',
    date: '2026-11-01 11:00:00',
    operatorName: 'Maria Caixa',
    customer: {
      name: 'Seu Raimundo Nonato',
      phone: '(11) 97777-6666',
      document: '123.456.789-00',
    },
    previousDebt: '45,00',
    amount: '35,00',
    newDebt: '80,00',
  };

  describe('Formatação de Cupom Não-Fiscal de Venda', () => {
    it('deve formatar cupom de venda em 58mm (largura padrão 32 colunas)', () => {
      const output = formatSaleReceipt(sampleSale, '58mm');
      const lines = output.split('\n');

      // Verifica se nenhuma linha ultrapassa a largura de 32 colunas
      lines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(32);
      });

      // Cabeçalho institucional
      expect(output).toContain('Mercadinho do Bairro');
      expect(output).toContain('(11) 98888-7777');
      expect(output).toContain('12.345.678/0001-90');

      // Dados da venda
      expect(output).toContain('sale-987654321');
      expect(output).toContain('Maria Caixa');

      // Itens discriminados
      expect(output).toContain('Arroz Tio João 5kg');
      expect(output).toContain('50,00');
      expect(output).toContain('Feijão Carioca 1kg');
      expect(output).toContain('8,50');

      // Totais e Desconto
      expect(output).toContain('SUBTOTAL');
      expect(output).toContain('76,50');
      expect(output).toContain('DESCONTO');
      expect(output).toContain('6,50');
      expect(output).toContain('TOTAL');
      expect(output).toContain('70,00');

      // Pagamento em dinheiro e troco
      expect(output).toContain('Dinheiro');
      expect(output).toContain('RECEBIDO');
      expect(output).toContain('100,00');
      expect(output).toContain('TROCO');
      expect(output).toContain('30,00');

      // Rodapé
      expect(output).toContain('Obrigado pela preferência!');
    });

    it('deve formatar cupom de venda em 80mm (largura 48 colunas)', () => {
      const output = formatSaleReceipt(sampleSale, '80mm');
      const lines = output.split('\n');

      lines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(48);
      });

      expect(output).toContain('Mercadinho do Bairro');
      expect(output).toContain('Arroz Tio João 5kg');
      expect(output).toContain('TOTAL');
      expect(output).toContain('70,00');
    });

    it('deve formatar múltiplos pagamentos (split payments)', () => {
      const splitSale: ThermalSaleReceiptData = {
        ...sampleSale,
        payments: [
          { method: 'Cartão Débito', amount: '50,00' },
          { method: 'PIX', amount: '20,00' },
        ],
      };

      const output = formatSaleReceipt(splitSale, '58mm');
      expect(output).toContain('Cartão Débito');
      expect(output).toContain('50,00');
      expect(output).toContain('PIX');
      expect(output).toContain('20,00');
      expect(output).not.toContain('TROCO');
    });
  });

  describe('Formatação de Canhoto de Fiado (Nota Promissória / Caderneta)', () => {
    it('deve formatar canhoto de fiado em 58mm com confissão de dívida e linha de assinatura', () => {
      const output = formatCreditNote(sampleCreditNote, '58mm');
      const lines = output.split('\n');

      lines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(32);
      });

      // Título
      expect(output).toContain('COMPROVANTE DE FIADO');

      // Dados do cliente
      expect(output).toContain('Seu Raimundo Nonato');
      expect(output).toContain('(11) 97777-6666');
      expect(output).toContain('123.456.789-00');

      // Histórico do débito
      expect(output).toContain('Saldo Anterior');
      expect(output).toContain('45,00');
      expect(output).toContain('Valor da Compra');
      expect(output).toContain('35,00');
      expect(output).toContain('NOVO SALDO DEVEDOR');
      expect(output).toContain('80,00');

      // Declaração de Confissão de Dívida
      expect(output).toContain('Reconheço a dívida discriminada');
      expect(output).toContain('comprometo-me');

      // Linha de assinatura
      expect(output).toContain('Assinatura do Cliente');
      expect(output).toContain('---');
    });

    it('deve formatar canhoto de fiado em 80mm com largura adequada', () => {
      const output = formatCreditNote(sampleCreditNote, '80mm');
      const lines = output.split('\n');

      lines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(48);
      });

      expect(output).toContain('COMPROVANTE DE FIADO');
      expect(output).toContain('NOVO SALDO DEVEDOR');
      expect(output).toContain('80,00');
      expect(output).toContain('Assinatura do Cliente');
    });
  });
});
