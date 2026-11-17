import { describe, it, expect } from 'vitest';
import { destinationForSession, afterLoginPath } from './session-destination';

describe('destinationForSession', () => {
  it('sends an operator with the cash register open straight to the PDV', () => {
    expect(destinationForSession({ cashOpen: true })).toBe('pdv');
  });

  it('asks an authenticated operator to open the cash register when it is closed', () => {
    expect(destinationForSession({ cashOpen: false })).toBe('open-cash');
  });
});

describe('afterLoginPath', () => {
  it('without voltar keeps today: PDV with the cash register open, the open cash screen otherwise', () => {
    expect(afterLoginPath({ cashOpen: true, voltar: null })).toBe('/pdv');
    expect(afterLoginPath({ cashOpen: false, voltar: null })).toBeNull();
  });

  it('goes to voltar, and the Gestão does not need an open cash register', () => {
    expect(afterLoginPath({ cashOpen: false, voltar: '/gestao' })).toBe('/gestao');
    expect(afterLoginPath({ cashOpen: true, voltar: '/gestao' })).toBe('/gestao');
    expect(afterLoginPath({ cashOpen: true, voltar: '/pdv' })).toBe('/pdv');
  });

  it('keeps the rule that the PDV needs an open cash register', () => {
    for (const voltar of ['/pdv', '/pdv/', '/pdv?x=1', '/pdv#a']) {
      expect(afterLoginPath({ cashOpen: false, voltar })).toBeNull();
    }
    expect(afterLoginPath({ cashOpen: false, voltar: '/pdvx' })).toBe('/pdvx');
  });
});
