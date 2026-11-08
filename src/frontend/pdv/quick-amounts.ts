// Bills a customer is likely to hand over, in cents, from the smallest to the largest.
const NOTES_IN_CENTS = [2000, 5000, 10000, 20000, 50000];

/**
 * Suggests round "valor recebido" amounts for a cash payment, in cents: the next multiple of
 * R$ 10 above the total, then the next common notes. Never includes the exact total (the
 * "Exato" button covers it) and never suggests anything below it.
 */
export function suggestCashAmounts(totalCents: number, max = 3): number[] {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return [];

  const suggestions: number[] = [];
  const nextTen = Math.ceil(totalCents / 1000) * 1000;
  if (nextTen > totalCents) suggestions.push(nextTen);

  for (const note of NOTES_IN_CENTS) {
    if (note > totalCents && !suggestions.includes(note)) suggestions.push(note);
  }

  return suggestions.sort((a, b) => a - b).slice(0, max);
}

/** Formats cents as the plain decimal string the cash input expects (e.g. 6000 -> "60.00"). */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Short label for a quick-amount button (e.g. 6000 -> "R$ 60"). */
export function quickAmountLabel(cents: number): string {
  const reais = cents / 100;
  return Number.isInteger(reais) ? `R$ ${reais}` : `R$ ${reais.toFixed(2).replace('.', ',')}`;
}
