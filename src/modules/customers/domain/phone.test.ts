import { describe, it, expect } from 'vitest';
import { Phone, phoneDigits, isStandardPhone } from './phone';
import { InvalidPhoneError } from './errors';

describe('Phone', () => {
  it.each([
    ['11999998888', '11999998888'],
    ['1132221111', '1132221111'],
    ['(11) 99999-8888', '11999998888'],
    ['(11) 3222-1111', '1132221111'],
    ['11 99999 8888', '11999998888'],
    ['  11999998888  ', '11999998888'],
    ['+55 11 99999-8888', '11999998888'],
    ['+5511999998888', '11999998888'],
    ['5511999998888', '11999998888'],
    ['551132221111', '1132221111'],
    ['55999998888', '55999998888'], // DDD 55 celular, 11 digits: prefix is not stripped
    ['5532221111', '5532221111'], // DDD 55 fixo, 10 digits
  ])('aceita %s e guarda %s', (input, expected) => {
    expect(Phone.create(input).value).toBe(expected);
    expect(isStandardPhone(input)).toBe(true);
  });

  it.each([
    ['letras', '11 9999a8888'],
    ['letras no meio de máscara', '(11) 99999-ABCD'],
    ['9 dígitos', '999998888'],
    ['12 dígitos sem 55', '119999988889'],
    ['13+ dígitos', '1199999888899'],
    ['DDD 00', '00999998888'],
    ['DDD 01', '01999998888'],
    ['DDD 10', '10999998888'],
    ['celular de 11 sem 9', '11899998888'],
    ['fixo de 10 começando com 9', '1192221111'],
    ['todos iguais (11)', '11111111111'],
    ['todos iguais (zeros)', '00000000000'],
    ['todos iguais (10)', '9999999999'],
    ['vazio', ''],
    ['só espaços', '   '],
    ['40 dígitos', '1'.repeat(39) + '2'],
    ['+ no meio', '11+999998888'],
  ])('recusa %s', (_label, input) => {
    expect(() => Phone.create(input)).toThrow(InvalidPhoneError);
    expect(isStandardPhone(input)).toBe(false);
  });

  it('tem mensagem em português', () => {
    expect(() => Phone.create('123')).toThrow(
      'Telefone inválido. Use o DDD e o número, com 8 ou 9 dígitos.'
    );
  });

  it('é idempotente', () => {
    for (const input of ['(11) 99999-8888', '+55 11 3222-1111', '55999998888']) {
      const once = Phone.create(input).value;
      expect(Phone.create(once).value).toBe(once);
    }
  });
});

describe('phoneDigits', () => {
  it('tira tudo que não é dígito, sem validar', () => {
    expect(phoneDigits('(11) 99999-8888')).toBe('11999998888');
    expect(phoneDigits('abc')).toBe('');
    expect(phoneDigits('123')).toBe('123');
  });
});

describe('isStandardPhone', () => {
  it('diz se o texto cru, já guardado, está no padrão', () => {
    expect(isStandardPhone('11999998888')).toBe(true);
    expect(isStandardPhone('123')).toBe(false);
  });
});
