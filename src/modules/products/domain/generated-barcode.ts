// Barcode generated for a product saved without one (D-23): "29" + 10 random digits + EAN-13 check digit.
const PREFIX = '29';
const RANDOM_DIGITS = 10;

// Check digit of the first 12 digits: odd positions weigh 1, even positions weigh 3.
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

// D-30: a real barcode is only digits, 8 (EAN-8), 12 (UPC-A), 13 (EAN-13) or 14 (GTIN-14), with the right check digit.
// Same rule as tmp_is_valid_barcode in drizzle/migrations/0005_replace_sem_barcodes.sql. The text is not trimmed here.
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  // The data digit next to the check digit weighs 3 and the weights alternate 3, 1 going left.
  let sum = 0;
  for (let i = 0; i < code.length - 1; i++) sum += Number(code[i]) * ((code.length - 2 - i) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

// `random` returns a number in [0, 1), like Math.random; injected so tests can control it.
export function generateBarcode(random: () => number = Math.random): string {
  let digits = '';
  for (let i = 0; i < RANDOM_DIGITS; i++) digits += Math.floor(random() * 10);
  const first12 = PREFIX + digits;
  return first12 + ean13CheckDigit(first12);
}
