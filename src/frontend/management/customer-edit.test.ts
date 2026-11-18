import { describe, it, expect, vi } from 'vitest';
import { ApiError, type CustomerItem } from '@/frontend/lib/api-client';
import {
  buildCustomerPatch,
  draftFromCustomer,
  editErrorMessage,
  isDraftValid,
  limitBelowDebt,
  limitRaised,
  maskLimit,
  submitCustomerEdit,
} from './customer-edit';

const maria: CustomerItem = { id: 'c1', name: 'Maria Souza', phone: '11981642350', creditLimit: '100.00', updatedAt: '2026-11-16T10:00:00.000Z' };
const old: CustomerItem = { ...maria, phone: '6261616161649496169' };

describe('draftFromCustomer', () => {
  it('masks a standard phone and the limit, and leaves an old phone as it is', () => {
    expect(draftFromCustomer(maria)).toEqual({ name: 'Maria Souza', phone: '(11) 98164-2350', limit: '100,00', creditBlocked: false, ownerPin: '' });
    expect(draftFromCustomer(old).phone).toBe('6261616161649496169');
  });
  it('a zero limit is an empty text', () => {
    expect(draftFromCustomer({ ...maria, creditLimit: '0.00' }).limit).toBe('');
  });
});

describe('maskLimit', () => {
  it('applies the cents mask up to R$ 500,00 and refuses what goes beyond', () => {
    expect(maskLimit('12500', '')).toBe('125,00');
    expect(maskLimit('50000', '')).toBe('500,00');
    expect(maskLimit('500001', '500,00')).toBe('500,00');
    expect(maskLimit('10000000', '125,00')).toBe('125,00');
  });
});

describe('owner PIN to raise the limit', () => {
  it('limitRaised is true only when the typed limit is above the current one', () => {
    expect(limitRaised(maria, { ...draftFromCustomer(maria), limit: '125,00' })).toBe(true);
    expect(limitRaised(maria, { ...draftFromCustomer(maria), limit: '100,00' })).toBe(false);
    expect(limitRaised(maria, { ...draftFromCustomer(maria), limit: '50,00' })).toBe(false);
    expect(limitRaised(maria, { ...draftFromCustomer(maria), limit: '' })).toBe(false);
  });
  it('sends ownerPin only when the limit goes up', () => {
    const up = { ...draftFromCustomer(maria), limit: '125,00', ownerPin: '123456' };
    expect(buildCustomerPatch(maria, up)).toEqual({ creditLimit: '125.00', ownerPin: '123456', expectedUpdatedAt: maria.updatedAt });
    const down = { ...draftFromCustomer(maria), limit: '50,00', ownerPin: '123456' };
    expect(buildCustomerPatch(maria, down)?.ownerPin).toBeUndefined();
    const nameOnly = { ...draftFromCustomer(maria), name: 'Nova', ownerPin: '123456' };
    expect(buildCustomerPatch(maria, nameOnly)?.ownerPin).toBeUndefined();
  });
});

describe('buildCustomerPatch', () => {
  it('is null while nothing changed', () => {
    expect(buildCustomerPatch(maria, draftFromCustomer(maria))).toBeNull();
    expect(buildCustomerPatch(old, draftFromCustomer(old))).toBeNull();
  });
  it('sends only the name (and expectedUpdatedAt), even with an old phone', () => {
    expect(buildCustomerPatch(old, { ...draftFromCustomer(old), name: ' Maria S. ' })).toEqual({
      name: 'Maria S.',
      expectedUpdatedAt: maria.updatedAt,
    });
  });
  it('sends only the limit as a decimal string', () => {
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), limit: '125,00' })).toEqual({
      creditLimit: '125.00',
      expectedUpdatedAt: maria.updatedAt,
    });
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), limit: '' })?.creditLimit).toBe('0.00');
  });
  it('sends the phone only when it changed', () => {
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), phone: '(11) 99999-8888' })?.phone).toBe('(11) 99999-8888');
  });
  it('sends creditBlocked, with expectedUpdatedAt, only when the switch changed', () => {
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), creditBlocked: true })).toEqual({
      creditBlocked: true,
      expectedUpdatedAt: maria.updatedAt,
    });
    const blocked = { ...maria, creditBlocked: true };
    expect(draftFromCustomer(blocked).creditBlocked).toBe(true);
    expect(buildCustomerPatch(blocked, draftFromCustomer(blocked))).toBeNull();
    expect(buildCustomerPatch(blocked, { ...draftFromCustomer(blocked), creditBlocked: false })?.creditBlocked).toBe(false);
  });
  it('sends the switch together with the other changed fields', () => {
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), limit: '125,00', creditBlocked: true })).toEqual({
      creditLimit: '125.00',
      creditBlocked: true,
      expectedUpdatedAt: maria.updatedAt,
    });
  });
  it('changing and undoing is no change', () => {
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), limit: '125,00' })).not.toBeNull();
    expect(buildCustomerPatch(maria, { ...draftFromCustomer(maria), limit: '100,00' })).toBeNull();
  });
});

describe('rules', () => {
  it('needs a name of 2 letters', () => {
    expect(isDraftValid({ name: '  ', phone: '', limit: '', creditBlocked: false, ownerPin: '' })).toBe(false);
    expect(isDraftValid({ name: 'A', phone: '', limit: '', creditBlocked: false, ownerPin: '' })).toBe(true);
    expect(isDraftValid({ name: 'Ana', phone: '', limit: '', creditBlocked: false, ownerPin: '' })).toBe(true);
  });
  it('warns only when the limit is below the debt, in cents', () => {
    expect(limitBelowDebt('50,00', 8550)).toBe(true);
    expect(limitBelowDebt('85,50', 8550)).toBe(false);
    expect(limitBelowDebt('', 1)).toBe(true);
    expect(limitBelowDebt('1,00', null)).toBe(false);
  });
});

describe('editErrorMessage', () => {
  it('conflict and missing customer offer a reload', () => {
    expect(editErrorMessage(new ApiError(409, 'x', undefined, 'CUSTOMER_CHANGED')).reload).toBe(true);
    expect(editErrorMessage(new ApiError(404, 'x')).reload).toBe(true);
  });
  it('400, 403 and a repeated phone show the server message, with no reload', () => {
    for (const status of [400, 403, 409]) {
      expect(editErrorMessage(new ApiError(status, 'Telefone já cadastrado.'))).toEqual({ text: 'Telefone já cadastrado.', reload: false });
    }
  });
});

describe('submitCustomerEdit', () => {
  it('does not call the api without a change', async () => {
    const update = vi.fn();
    expect(await submitCustomerEdit(update, maria, draftFromCustomer(maria))).toEqual({ kind: 'nochange' });
    expect(update).not.toHaveBeenCalled();
  });
  it('returns the saved customer or the failure', async () => {
    const saved = { ...maria, name: 'Nova' };
    const draft = { ...draftFromCustomer(maria), name: 'Nova' };
    expect(await submitCustomerEdit(async () => saved, maria, draft)).toEqual({ kind: 'saved', item: saved });
    const failed = await submitCustomerEdit(async () => { throw new ApiError(400, 'Telefone inválido.'); }, maria, draft);
    expect(failed).toEqual({ kind: 'failed', text: 'Telefone inválido.', reload: false });
  });
});
