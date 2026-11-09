import { parseGrams, parseKilosToGrams } from '@/shared/domain/product-unit';

/**
 * What the cashier types for a weight: only digits is grams ("350"), digits with a comma or a point is
 * kilograms ("0,350" or "1.25"). Null while it is empty or not a valid weight.
 */
export function parseWeightInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/[.,]/.test(trimmed)) return parseKilosToGrams(trimmed);
  return parseGrams(trimmed);
}

/** The step of the plus and minus buttons for a line sold by weight, in grams. */
export const WEIGHT_STEP_GRAMS = 50;
