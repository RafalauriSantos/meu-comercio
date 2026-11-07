import { describe, it, expect } from 'vitest';
import { passwordsMismatch } from './passwords-mismatch';

describe('passwordsMismatch', () => {
  it.each([
    ['segredo123', '', false],
    ['segredo123', 'seg', false],
    ['segredo123', 'segredo123', false],
    ['segredo123', 'segredo124', true],
    ['segredo123', 'segredo1234', true],
    ['segredo123', 'xxxxxxxxxx', true],
    ['', 'a', true],
  ])('password %j with confirmation %j gives %s', (password, confirm, expected) => {
    expect(passwordsMismatch(password, confirm)).toBe(expected);
  });
});
