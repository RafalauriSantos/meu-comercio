const MAX_DIGITS = 9;

/**
 * Máscara de centavos: só os dígitos contam e a vírgula aparece sozinha ("125" vira "1,25").
 * Trabalha só com texto (sem number) e devolve uma string que parseCurrencyInput aceita.
 */
export function maskCurrencyDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS).replace(/^0+/, '');
  if (digits === '') return '';
  const padded = digits.padStart(3, '0');
  return `${padded.slice(0, -2)},${padded.slice(-2)}`;
}
