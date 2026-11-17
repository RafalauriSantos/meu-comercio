import { describe, it, expect } from 'vitest';
import { displayPhone, isStandardPhone, maskPhone, phoneDigits } from './phone-mask';

describe('phoneDigits', () => {
  it.each([
    ['(11) 99999-8888', '11999998888'],
    ['abc', ''],
    ['+55 11 99999-8888', '11999998888'],
    ['5511999998888', '11999998888'],
    ['551132221111', '1132221111'],
    ['55999998888', '55999998888'], // DDD 55: the 55 stays when 11 digits are left
    ['5532221111', '5532221111'],
    ['119999988889999', '11999998888'], // at most 11
  ])('%s -> %s', (raw, expected) => {
    expect(phoneDigits(raw)).toBe(expected);
  });
});

describe('maskPhone', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['119999', '(11) 9999'],
    ['1199998', '(11) 99998'],
    ['11999998', '(11) 99999-8'],
    ['119999988', '(11) 99999-88'],
    ['1132221111', '(11) 3222-1111'],
    ['11999998888', '(11) 99999-8888'],
    ['+55 11 99999-8888', '(11) 99999-8888'],
    ['5511999998888', '(11) 99999-8888'],
    ['11999998888999', '(11) 99999-8888'],
  ])('%s -> %s', (raw, expected) => {
    expect(maskPhone(raw)).toBe(expected);
  });

  it('deleting one character at a time never gets stuck', () => {
    let text = maskPhone('11999998888');
    let digits = 11;
    while (text !== '') {
      text = maskPhone(text.slice(0, -1));
      digits -= 1;
      expect(phoneDigits(text)).toHaveLength(Math.max(digits, 0));
    }
    expect(digits).toBeLessThanOrEqual(0);
  });
});

// Same cases as the backend domain test (src/modules/customers/domain/phone.test.ts).
describe('isStandardPhone', () => {
  it.each([
    '11999998888',
    '1132221111',
    '(11) 99999-8888',
    '(11) 3222-1111',
    '11 99999 8888',
    '  11999998888  ',
    '+55 11 99999-8888',
    '+5511999998888',
    '5511999998888',
    '551132221111',
    '55999998888',
    '5532221111',
  ])('accepts "%s"', (input) => {
    expect(isStandardPhone(input)).toBe(true);
  });

  it.each([
    '11 9999a8888',
    '(11) 99999-ABCD',
    '999998888',
    '119999988889',
    '1199999888899',
    '00999998888',
    '01999998888',
    '10999998888',
    '11899998888',
    '1192221111',
    '11111111111',
    '00000000000',
    '9999999999',
    '',
    '   ',
    '1'.repeat(39) + '2',
    '11+999998888',
  ])('refuses "%s"', (input) => {
    expect(isStandardPhone(input)).toBe(false);
  });
});

describe('displayPhone', () => {
  it('masks a standard phone and leaves a legacy one as stored', () => {
    expect(displayPhone('11999998888')).toBe('(11) 99999-8888');
    expect(displayPhone('1132221111')).toBe('(11) 3222-1111');
    expect(displayPhone('123')).toBe('123');
    expect(displayPhone('Ana - balcão')).toBe('Ana - balcão');
  });
});
