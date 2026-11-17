const ALLOWED_INPUT = /^\+?[\d\s().-]+$/;
const MAX_DIGITS = 11;

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** A pasted 55 prefix goes away only when 10 or 11 digits are left (same as D-21 in the backend). */
function withoutCountryCode(digits: string): string {
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

/** National digits, at most 11. */
export function phoneDigits(raw: string): string {
  return withoutCountryCode(onlyDigits(raw)).slice(0, MAX_DIGITS);
}

/** "(11) 99999-8888" (11 digits) or "(11) 9999-8888" (10), built up as the digits are typed. */
export function maskPhone(raw: string): string {
  const digits = phoneDigits(raw);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  const rest = digits.slice(2);
  const split = digits.length === 10 ? 4 : 5;
  if (rest.length <= split) return `(${digits.slice(0, 2)}) ${rest}`;
  return `(${digits.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Same rule as the backend (src/modules/customers/domain/phone.ts): the front must agree with it. */
export function isStandardPhone(raw: string): boolean {
  const text = raw.trim();
  if (!ALLOWED_INPUT.test(text)) return false;
  const digits = withoutCountryCode(onlyDigits(text));

  const isMobile = digits.length === 11;
  const isLandline = digits.length === 10;
  const ddd = digits.slice(0, 2);
  const validDdd = ddd[0] !== '0' && ddd !== '10';
  const validKind = isMobile ? digits[2] === '9' : isLandline && digits[2] !== '9';
  return validDdd && validKind && !/^(\d)\1+$/.test(digits);
}

/** The stored phone masked when it follows the rule; an old free-form one stays as it is. */
export function displayPhone(stored: string): string {
  return isStandardPhone(stored) ? maskPhone(stored) : stored;
}
