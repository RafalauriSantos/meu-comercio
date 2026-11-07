/** Keeps only digits and cuts at six, so a non-digit or a long paste never reaches the PIN state. */
export function sanitizePin(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
