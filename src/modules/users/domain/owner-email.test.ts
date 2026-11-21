import { describe, it, expect } from 'vitest';
import { isValidEmail, maskEmail, normalizeEmail } from './owner-email';

describe('owner-email', () => {
  it('normaliza com trim e minúsculas', () => {
    expect(normalizeEmail('  Maria@Gmail.COM ')).toBe('maria@gmail.com');
  });

  it('valida e-mail simples e recusa sem @, com espaço ou acima de 254 caracteres', () => {
    expect(isValidEmail('maria@gmail.com')).toBe(true);
    expect(isValidEmail('maria.gmail.com')).toBe(false);
    expect(isValidEmail('@gmail.com')).toBe(false);
    expect(isValidEmail('maria@')).toBe(false);
    expect(isValidEmail('ma ria@gmail.com')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
    expect(isValidEmail(`${'a'.repeat(248)}@b.co`)).toBe(true);
  });

  it('mascara mantendo a primeira letra e o domínio', () => {
    expect(maskEmail('maria@gmail.com')).toBe('m***@gmail.com');
  });
});
