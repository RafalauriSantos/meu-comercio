import { describe, it, expect } from 'vitest';
import { InvalidNewPasswordError } from '../domain/errors';
import { validateNewPin } from './new-credentials';

describe('validateNewPin (AC-30)', () => {
  it('aceita exatamente 6 dígitos iguais nos dois campos, inclusive com zero à esquerda', () => {
    expect(() => validateNewPin('123456', '123456')).not.toThrow();
    expect(() => validateNewPin('012345', '012345')).not.toThrow();
  });

  it.each([
    ['5 dígitos', '12345'],
    ['7 dígitos', '1234567'],
    ['letras', '12a456'],
    ['espaços nas pontas', ' 12345 '],
    ['quebra de linha no fim', '123456\n'],
    ['vazio', ''],
  ])('recusa PIN com %s', (_name, pin) => {
    const error = (() => { try { validateNewPin(pin, pin); } catch (e) { return e; } })();
    expect(error).toBeInstanceOf(InvalidNewPasswordError);
    expect((error as Error).message).toBe('O PIN deve ter exatamente 6 números.');
  });

  it('recusa PINs diferentes', () => {
    expect(() => validateNewPin('123456', '654321')).toThrow('Os PINs não conferem.');
  });
});
