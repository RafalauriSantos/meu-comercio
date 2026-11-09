// Searching the catalog by name from the same field that takes the barcode.

export const MIN_SEARCH_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Digits only is a barcode (typed or read by the scanner) and goes straight to the barcode lookup. Text with
 * a letter in it is a name, so the matching products are offered while the cashier types.
 */
export function isNameSearch(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_SEARCH_LENGTH && /\p{L}/u.test(trimmed);
}

/** The highlighted row after an arrow key, wrapping around the ends. Anything else keeps it. */
export function moveHighlight(current: number, count: number, key: string): number {
  if (count <= 0) return 0;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return (current - 1 + count) % count;
  return current;
}
