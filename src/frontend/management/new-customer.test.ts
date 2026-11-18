import { describe, it, expect } from 'vitest';
import {
  EMPTY_NEW_CUSTOMER,
  buildNewCustomerPayload,
  canSaveNewCustomer,
  newCustomerSuccessText,
  newLimitAboveZero,
} from './new-customer';

const base = { ...EMPTY_NEW_CUSTOMER, name: ' Ana Lima ', phone: '(11) 99999-8888' };

describe('canSaveNewCustomer', () => {
  it('needs a name and a standard phone', () => {
    expect(canSaveNewCustomer(EMPTY_NEW_CUSTOMER, true)).toBe(false);
    expect(canSaveNewCustomer({ ...base, name: '  ' }, true)).toBe(false);
    expect(canSaveNewCustomer({ ...base, phone: '(11) 99999' }, true)).toBe(false);
    expect(canSaveNewCustomer({ ...base, phone: '(11) 11111-1111' }, true)).toBe(false);
    expect(canSaveNewCustomer(base, false)).toBe(true);
  });
  it('the owner with a limit above zero also needs the 6-digit PIN', () => {
    const withLimit = { ...base, limit: '125,00' };
    expect(canSaveNewCustomer(withLimit, true)).toBe(false);
    expect(canSaveNewCustomer({ ...withLimit, ownerPin: '12345' }, true)).toBe(false);
    expect(canSaveNewCustomer({ ...withLimit, ownerPin: '123456' }, true)).toBe(true);
    expect(canSaveNewCustomer(base, true)).toBe(true);
  });
  it('the operator never needs a PIN, even with a stale limit in the draft', () => {
    expect(newLimitAboveZero({ ...base, limit: '125,00' }, false)).toBe(false);
    expect(canSaveNewCustomer({ ...base, limit: '125,00' }, false)).toBe(true);
  });
});

describe('buildNewCustomerPayload', () => {
  it('the operator sends only name and phone, never a limit or a PIN', () => {
    expect(buildNewCustomerPayload({ ...base, limit: '125,00', ownerPin: '123456' }, false)).toEqual({
      name: 'Ana Lima',
      phone: '(11) 99999-8888',
    });
  });
  it('the owner with limit zero sends no limit and no PIN', () => {
    expect(buildNewCustomerPayload({ ...base, ownerPin: '123456' }, true)).toEqual({ name: 'Ana Lima', phone: '(11) 99999-8888' });
  });
  it('the owner with a limit sends it as a decimal string with the PIN', () => {
    expect(buildNewCustomerPayload({ ...base, limit: '125,50', ownerPin: '123456' }, true)).toEqual({
      name: 'Ana Lima',
      phone: '(11) 99999-8888',
      creditLimit: '125.50',
      ownerPin: '123456',
    });
  });
});

describe('newCustomerSuccessText', () => {
  it('has one text for the owner and one for the operator', () => {
    expect(newCustomerSuccessText(true)).toBe('Cliente cadastrado.');
    expect(newCustomerSuccessText(false)).toBe('Cliente cadastrado com limite R$ 0,00. A proprietária libera o limite editando o cliente.');
  });
});
