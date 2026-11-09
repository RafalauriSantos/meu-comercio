import { GRAMS_PER_KG, parseKilosToGrams, type ProductUnit } from '@/shared/domain/product-unit';

// Regras de estoque da tela de gestão. O modelo de dados não tem estoque mínimo por produto,
// então "estoque baixo" usa um limite fixo: até 5 unidades, ou até 2 kg para produto vendido por peso
// (o estoque desses produtos é guardado em gramas).
export const LOW_STOCK_THRESHOLD = 5;
export const LOW_STOCK_THRESHOLD_GRAMS = 2000;

export type StockStatus = 'out' | 'low' | 'ok';
export type StockFilter = 'all' | 'low' | 'out';

interface StockedProduct {
  /** Por unidade, ou por quilo quando a unidade é 'KG'. */
  salePrice: number;
  /** Unidades, ou gramas quando a unidade é 'KG'. */
  availableQuantity: number;
  unit?: ProductUnit;
}

export function stockStatus(quantity: number, unit: ProductUnit = 'UN'): StockStatus {
  if (quantity <= 0) return 'out';
  const threshold = unit === 'KG' ? LOW_STOCK_THRESHOLD_GRAMS : LOW_STOCK_THRESHOLD;
  if (quantity <= threshold) return 'low';
  return 'ok';
}

// Produtos que precisam de reposição: com estoque baixo ou zerado.
export function countNeedingRestock(products: StockedProduct[]): number {
  return products.filter((p) => stockStatus(p.availableQuantity, p.unit) !== 'ok').length;
}

// Valor do estoque a preço de venda (preço x quantidade). Quantidades negativas não abatem o total.
// O cálculo é feito em centavos para não acumular erro de ponto flutuante. Produto vendido por peso:
// preço por quilo x gramas / 1000, arredondado ao centavo em cada produto, como numa venda.
export function inventoryValue(products: StockedProduct[]): number {
  const cents = products.reduce((sum, p) => {
    const priceCents = Math.round(p.salePrice * 100);
    const quantity = Math.max(0, p.availableQuantity);
    const productCents = p.unit === 'KG' ? Math.round((priceCents * quantity) / GRAMS_PER_KG) : priceCents * quantity;
    return sum + productCents;
  }, 0);
  return cents / 100;
}

export function matchesStockFilter(quantity: number, filter: StockFilter, unit: ProductUnit = 'UN'): boolean {
  if (filter === 'all') return true;
  if (filter === 'out') return stockStatus(quantity, unit) === 'out';
  return stockStatus(quantity, unit) === 'low';
}

/**
 * What the owner typed for the initial stock, as the quantity the API stores: units (whole number) or,
 * for a product sold by weight, the kilograms typed as grams. Empty means none. Null when it is invalid.
 */
export function initialStockToQuantity(text: string, unit: ProductUnit): number | null {
  const trimmed = text.trim();
  if (unit === 'KG') {
    if (trimmed === '' || Number(trimmed.replace(',', '.')) === 0) return 0;
    return parseKilosToGrams(trimmed);
  }
  if (trimmed === '') return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** The quantity of a restock: units (whole number >= 1) or kilograms typed, as grams. Null when invalid. */
export function restockToQuantity(text: string, unit: ProductUnit): number | null {
  const trimmed = text.trim();
  if (unit === 'KG') return parseKilosToGrams(trimmed);
  if (!/^\d+$/.test(trimmed)) return null;
  const units = Number(trimmed);
  return units >= 1 ? units : null;
}
