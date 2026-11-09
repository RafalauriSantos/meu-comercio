// The sample sheet the owner can download: semicolon separated, which is what Excel in Portuguese opens
// and saves, with prices written the Brazilian way.
export const PRODUCT_IMPORT_TEMPLATE = [
  'Código de barras;Nome;Preço;Estoque',
  '7891000100103;Arroz Tipo 1 5kg;24,90;12',
  '7891000200207;Feijão Carioca 1kg;8,50;30',
  '',
].join('\r\n');
