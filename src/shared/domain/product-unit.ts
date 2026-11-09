import { Money } from './money';

/**
 * How a product is sold. "UN" is by the unit: the price is per unit and the quantity counts units.
 * "KG" is by weight: the price is per kilogram and the quantity (in a sale and in the stock) counts GRAMS,
 * always a whole number, so the rest of the system keeps working with integer quantities.
 */
export type ProductUnit = 'UN' | 'KG';

export const GRAMS_PER_KG = 1000;

export function isProductUnit(value: unknown): value is ProductUnit {
  return value === 'UN' || value === 'KG';
}

/**
 * The value of a sale line. By the unit it is price x quantity. By weight it is price per kg x grams / 1000,
 * rounded to the cent (half up) on the line itself, so the sum of the lines is always the total that is
 * charged and printed, with no cent that appears only in the total.
 */
export function lineSubtotal(unitPrice: Money, quantity: number, unit: ProductUnit = 'UN'): Money {
  const exact = unitPrice.multiply(quantity);
  if (unit !== 'KG') return exact;
  return Money.fromDecimal(exact.divide(GRAMS_PER_KG).toDecimal());
}

/** "350 g", "1,25 kg", or just the number for a product sold by the unit. */
export function formatQuantity(quantity: number, unit: ProductUnit = 'UN'): string {
  if (unit !== 'KG') return String(quantity);
  if (Math.abs(quantity) < GRAMS_PER_KG) return `${quantity} g`;
  const kilos = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(quantity / GRAMS_PER_KG);
  return `${kilos} kg`;
}

/** "1,250" or "1.25" (kilograms) to whole grams. Null when it is not a positive number with up to 3 decimals. */
export function parseKilosToGrams(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  const grams = Math.round(Number(normalized) * GRAMS_PER_KG);
  return grams > 0 ? grams : null;
}

/** "350" (grams) to whole grams. Null when it is not a positive whole number. */
export function parseGrams(text: string): number | null {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const grams = Number(normalized);
  return grams > 0 ? grams : null;
}
