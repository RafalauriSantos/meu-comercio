import { InvalidPhoneError } from './errors';

const ALLOWED_INPUT = /^\+?[\d\s().-]+$/;

/** Only the digits of the text, with no validation. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Brazilian phone, kept as national digits: DDD + 8 or 9 digits (D-21). */
export class Phone {
  private constructor(public readonly value: string) {}

  public static create(raw: string): Phone {
    const text = raw.trim();
    if (!ALLOWED_INPUT.test(text)) {
      throw new InvalidPhoneError();
    }

    let digits = phoneDigits(text);
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }

    const isMobile = digits.length === 11;
    const isLandline = digits.length === 10;
    const ddd = digits.slice(0, 2);
    const validDdd = ddd[0] !== '0' && ddd !== '10';
    const validKind = isMobile ? digits[2] === '9' : isLandline && digits[2] !== '9';
    const allSame = /^(\d)\1+$/.test(digits);

    if (!validDdd || !validKind || allSame) {
      throw new InvalidPhoneError();
    }
    return new Phone(digits);
  }
}

/** True when the text follows the phone rule; false for legacy or free-form text. */
export function isStandardPhone(raw: string): boolean {
  try {
    Phone.create(raw);
    return true;
  } catch {
    return false;
  }
}
