import { describe, it, expect } from 'vitest';
import { parseAuthMode } from './auth-mode';

describe('parseAuthMode', () => {
  it.each(['', '?modo=login', '?modo=CADASTRO', '?foo=1', '?modo='])(
    'opens the login for %j',
    (search) => {
      expect(parseAuthMode(search)).toBe('login');
    }
  );

  it.each(['?modo=cadastro', '?x=1&modo=cadastro', 'modo=cadastro'])(
    'opens the register form for %j',
    (search) => {
      expect(parseAuthMode(search)).toBe('register');
    }
  );
});
