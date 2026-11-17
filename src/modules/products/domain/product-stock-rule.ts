// When a product needs restocking: up to 5 units, or up to 2000 g for a product sold by weight (its stock is
// kept in grams). Same limits as the management screen (src/frontend/management/stock.ts); a test keeps them equal.
export const RESTOCK_THRESHOLD_UNITS = 5;
export const RESTOCK_THRESHOLD_GRAMS = 2000;
