import { ApiError } from '@/frontend/lib/api-client';
import { SCAN_MIN_LENGTH } from '@/frontend/lib/barcode-scan-detector';
import { parseCurrencyInput } from '@/frontend/lib/formatters';

/** The lookup said the code is not in the catalog (404). A network failure, timeout or 5xx is not this. */
export function isUnknownCodeError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Only digits are a barcode (same rule as the search field): a name that found nothing never opens the panel. */
export function isRegistrableCode(code: string): boolean {
  return code.length >= SCAN_MIN_LENGTH && /^\d+$/.test(code);
}

export const MIN_NAME_LENGTH = 2;

/** What is wrong with the form of a new product on the sales screen, or null. The price must be above zero (D-25). */
export function newProductError({ name, price }: { name: string; price: string }): string | null {
  if (name.trim().length < MIN_NAME_LENGTH) return 'Informe o nome do produto (2 letras ou mais).';
  return parseCurrencyInput(price) > 0 ? null : 'Informe um preço de venda maior que zero.';
}

export const registeredNotice = (name: string) => `Produto "${name}" cadastrado e adicionado.`;
