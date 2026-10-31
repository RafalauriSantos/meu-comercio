import { describe, it, expect } from 'vitest';
import { formatMoney, parseCurrencyInput, getErrorMessage } from './formatters';
import { Money } from '@/shared/domain/money';
import { ApiError } from './api-client';

describe('formatters & helpers', () => {
  describe('formatMoney', () => {
    it('formats numbers to BRL currency string', () => {
      expect(formatMoney(10)).toBe('R$ 10,00');
      expect(formatMoney(24.9)).toBe('R$ 24,90');
      expect(formatMoney(0)).toBe('R$ 0,00');
    });

    it('formats string numbers (with dot or comma) to BRL', () => {
      expect(formatMoney('24.90')).toBe('R$ 24,90');
      expect(formatMoney('24,90')).toBe('R$ 24,90');
    });

    it('formats Money value objects directly using formatBrl', () => {
      const money = Money.fromDecimal('99.99');
      expect(formatMoney(money)).toBe('R$ 99,99');
    });

    it('handles null, undefined, empty string and invalid inputs gracefully returning R$ 0,00', () => {
      expect(formatMoney(null)).toBe('R$ 0,00');
      expect(formatMoney(undefined)).toBe('R$ 0,00');
      expect(formatMoney('')).toBe('R$ 0,00');
      expect(formatMoney('invalid-number')).toBe('R$ 0,00');
    });
  });

  describe('parseCurrencyInput', () => {
    it('parses valid numeric strings with dot or comma', () => {
      expect(parseCurrencyInput('10.50')).toBe(10.5);
      expect(parseCurrencyInput('10,50')).toBe(10.5);
      expect(parseCurrencyInput(15.75)).toBe(15.75);
    });

    it('returns default value for empty, null, undefined or invalid inputs', () => {
      expect(parseCurrencyInput('')).toBe(0);
      expect(parseCurrencyInput(null)).toBe(0);
      expect(parseCurrencyInput(undefined)).toBe(0);
      expect(parseCurrencyInput('not-a-number', 10)).toBe(10);
    });
  });

  describe('getErrorMessage', () => {
    it('extracts message from ApiError without field errors', () => {
      const err = new ApiError(400, 'Saldo insuficiente');
      expect(getErrorMessage(err)).toBe('Saldo insuficiente');
    });

    it('extracts message and field errors from ApiError', () => {
      const err = new ApiError(422, 'Dados inválidos', [
        { field: 'barcode', message: 'Código duplicado' },
      ]);
      expect(getErrorMessage(err)).toBe('Dados inválidos (Código duplicado)');
    });

    it('extracts message from generic Error', () => {
      const err = new Error('Falha de rede');
      expect(getErrorMessage(err)).toBe('Falha de rede');
    });

    it('falls back to defaultMessage for non-error objects', () => {
      expect(getErrorMessage('some error string', 'Erro padrão')).toBe('Erro padrão');
      expect(getErrorMessage(null, 'Erro padrão')).toBe('Erro padrão');
    });
  });
});
