import { describe, it, expect, vi } from 'vitest';
import { ApiError, type CustomerItem, type ProductItem } from '@/frontend/lib/api-client';
import {
  customerDeleteBlock,
  deleteErrorMessage,
  deletedCountText,
  deletedNotice,
  isPinComplete,
  productStockWarning,
  restoredNotice,
  submitCustomerActive,
  submitProductActive,
} from './deactivate';

const rice: ProductItem = { id: 'p1', barcode: '789', name: 'Arroz 5 kg', salePrice: 27.9, availableQuantity: 12, updatedAt: '2026-11-16T10:00:00.000Z' };
const maria: CustomerItem = { id: 'c1', name: 'Maria Souza', phone: '11981642350', updatedAt: '2026-11-16T10:00:00.000Z' };

describe('customerDeleteBlock', () => {
  it('waits while the balance has not arrived, blocks with a debt, and lets a zero debt through', () => {
    expect(customerDeleteBlock(null)).toBe('Aguarde o saldo carregar.');
    expect(customerDeleteBlock(8550)).toBe('Este cliente deve R$ 85,50. Receba o valor para poder excluir.');
    expect(customerDeleteBlock(0)).toBeNull();
  });
});

describe('productStockWarning', () => {
  it('warns only with stock control on and a positive balance', () => {
    expect(productStockWarning(rice, true)).toBe('Este produto tem 12 un. em estoque. Ele continua guardado, mas o produto some do caixa.');
    expect(productStockWarning(rice, false)).toBeNull();
    expect(productStockWarning({ ...rice, availableQuantity: 0 }, true)).toBeNull();
  });
  it('shows a product sold by weight in kg, without "un."', () => {
    expect(productStockWarning({ ...rice, unit: 'KG', availableQuantity: 2500 }, true)).toBe(
      'Este produto tem 2,5 kg em estoque. Ele continua guardado, mas o produto some do caixa.',
    );
  });
});

describe('notices and small rules', () => {
  it('writes the notices of the prototype', () => {
    expect(deletedNotice('Arroz')).toBe('Arroz foi excluído. Dá para restaurar no filtro "Excluídos".');
    expect(restoredNotice('Arroz')).toBe('Arroz foi restaurado.');
  });
  it('accepts only six digits as the PIN', () => {
    expect(isPinComplete('123456')).toBe(true);
    expect(isPinComplete('12345')).toBe(false);
    expect(isPinComplete('12345a')).toBe(false);
  });
  it('adds a plus to the count when the page was full', () => {
    expect(deletedCountText(3, false)).toBe('3');
    expect(deletedCountText(100, true)).toBe('100+');
  });
});

describe('deleteErrorMessage', () => {
  it('keeps the server text for a debt and for an invalid PIN, with no reload', () => {
    const debt = new ApiError(409, 'Este cliente deve R$ 85,50. Receba o valor para poder excluir.', undefined, 'CUSTOMER_HAS_DEBT');
    expect(deleteErrorMessage(debt, 'customer')).toEqual({ text: debt.message, reload: false });
    const pin = new ApiError(403, 'PIN de autorização da proprietária inválido.');
    expect(deleteErrorMessage(pin, 'customer')).toEqual({ text: pin.message, reload: false });
  });
  it('asks for the PIN when the server says it is missing', () => {
    expect(deleteErrorMessage(new ApiError(400, 'x', undefined, 'OWNER_PIN_REQUIRED'), 'customer').text).toBe('Digite o PIN da proprietária (6 dígitos).');
  });
  it('offers a reload on a change by someone else or a missing item, in plain words', () => {
    const changed = deleteErrorMessage(new ApiError(409, 'raw', undefined, 'CUSTOMER_CHANGED'), 'customer');
    expect(changed).toEqual({ text: 'Este cliente foi alterado por outra pessoa. Recarregue a lista e tente de novo.', reload: true });
    expect(deleteErrorMessage(new ApiError(409, 'raw', undefined, 'PRODUCT_CHANGED'), 'product').text).toContain('Este produto foi alterado');
    expect(deleteErrorMessage(new ApiError(404, 'raw'), 'product').reload).toBe(true);
  });
  it('falls back to a plain sentence for an unknown failure', () => {
    expect(deleteErrorMessage(new Error('boom'), 'product').reload).toBe(false);
  });
});

describe('submitProductActive', () => {
  it('sends active and the version read on listing, and returns the item', async () => {
    const update = vi.fn().mockResolvedValue({ ...rice, active: false });
    const result = await submitProductActive(update, rice, false);
    expect(update).toHaveBeenCalledWith('p1', { active: false, expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });
    expect(result).toEqual({ kind: 'done', item: { ...rice, active: false } });
  });
  it('turns a failure into a message', async () => {
    const update = vi.fn().mockRejectedValue(new ApiError(409, 'raw', undefined, 'PRODUCT_CHANGED'));
    expect(await submitProductActive(update, rice, false)).toMatchObject({ kind: 'failed', reload: true });
  });
});

describe('submitCustomerActive', () => {
  it('sends the PIN with active=false', async () => {
    const update = vi.fn().mockResolvedValue({ ...maria, active: false });
    await submitCustomerActive(update, maria, false, '123456');
    expect(update).toHaveBeenCalledWith('c1', { active: false, ownerPin: '123456', expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });
  });
  it('restores without a PIN, even if one is given', async () => {
    const update = vi.fn().mockResolvedValue(maria);
    await submitCustomerActive(update, maria, true, '123456');
    expect(update).toHaveBeenCalledWith('c1', { active: true, expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });
  });
  it('fails with the debt text and does not leak the PIN into the message', async () => {
    const update = vi.fn().mockRejectedValue(new ApiError(409, 'Este cliente deve R$ 10,00. Receba o valor para poder excluir.', undefined, 'CUSTOMER_HAS_DEBT'));
    const result = await submitCustomerActive(update, maria, false, '123456');
    expect(result).toEqual({ kind: 'failed', text: 'Este cliente deve R$ 10,00. Receba o valor para poder excluir.', reload: false });
  });
});
