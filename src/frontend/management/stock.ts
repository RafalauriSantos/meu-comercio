// Regras de estoque da tela de gestão. O modelo de dados não tem estoque mínimo por produto,
// então "estoque baixo" usa o mesmo limite fixo que a tela já usava (até 5 unidades).
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'out' | 'low' | 'ok';
export type StockFilter = 'all' | 'low' | 'out';

interface StockedProduct {
  salePrice: number;
  availableQuantity: number;
}

export function stockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

// Produtos que precisam de reposição: com estoque baixo ou zerado.
export function countNeedingRestock(products: StockedProduct[]): number {
  return products.filter((p) => stockStatus(p.availableQuantity) !== 'ok').length;
}

// Valor do estoque a preço de venda (preço x quantidade). Quantidades negativas não abatem o total.
// O cálculo é feito em centavos para não acumular erro de ponto flutuante.
export function inventoryValue(products: StockedProduct[]): number {
  const cents = products.reduce(
    (sum, p) => sum + Math.round(p.salePrice * 100) * Math.max(0, p.availableQuantity),
    0
  );
  return cents / 100;
}

export function matchesStockFilter(quantity: number, filter: StockFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'out') return stockStatus(quantity) === 'out';
  return stockStatus(quantity) === 'low';
}
