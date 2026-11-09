// The sample sheet the owner can download: semicolon separated, which is what Excel in Portuguese opens
// and saves, with prices written the Brazilian way. The last row is a product sold by weight: the price is
// per kilogram and the stock is in kilograms.
export const PRODUCT_IMPORT_TEMPLATE = [
  'Código de barras;Nome;Preço;Estoque;Unidade',
  '7891000100103;Arroz Tipo 1 5kg;24,90;12;un',
  '7891000200207;Feijão Carioca 1kg;8,50;30;un',
  '2000000000900;Queijo Mussarela (por quilo);42,90;2,5;kg',
  '',
].join('\r\n');
