import { Money } from '@/shared/domain/money';
import { ApiError } from './api-client';

/**
 * Formata um valor numérico, string ou Money para o formato monetário brasileiro (BRL).
 * Garante consistência em todo o frontend da aplicação.
 */
export function formatMoney(val: number | string | Money | null | undefined): string {
  if (val instanceof Money) {
    return val.formatBrl();
  }
  if (val === null || val === undefined || val === '') {
    return Money.zero().formatBrl();
  }
  try {
    const sanitized = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    if (isNaN(sanitized) || !isFinite(sanitized)) {
      return Money.zero().formatBrl();
    }
    return Money.fromDecimal(sanitized).formatBrl();
  } catch {
    return Money.zero().formatBrl();
  }
}

/**
 * Converte entradas de texto (suportando vírgula ou ponto como separador decimal) em número finito.
 */
export function parseCurrencyInput(
  val: string | number | null | undefined,
  defaultValue: number | string = 0
): number {
  const fallback =
    typeof defaultValue === 'number'
      ? isNaN(defaultValue) || !isFinite(defaultValue)
        ? 0
        : defaultValue
      : parseFloat(String(defaultValue).replace(',', '.')) || 0;

  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? fallback : val;
  }
  const parsed = parseFloat(String(val).replace(',', '.'));
  return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
}

/**
 * Extrai mensagens de erro legíveis e consistentes a partir de ApiError ou Error comum.
 */
export function getErrorMessage(
  err: unknown,
  defaultMessage = 'Ocorreu um erro ao processar a operação.'
): string {
  if (err instanceof ApiError) {
    if (err.errors && err.errors.length > 0) {
      return `${err.message} (${err.errors.map((e) => e.message).join(', ')})`;
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return defaultMessage;
}
