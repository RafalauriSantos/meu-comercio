import { describe, it, expect, vi } from 'vitest';
import { ApiError, type ProductItem } from '@/frontend/lib/api-client';
import {
  BARCODE_CHANGE_WARNING,
  PRICE_CHANGE_WARNING,
  barcodeChanged,
  buildProductPatch,
  draftFromProduct,
  editErrorMessage,
  isDraftValid,
  priceChanged,
  priceToDigits,
  submitProductEdit,
} from './product-edit';

const rice: ProductItem = { id: 'a', barcode: '789', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 12, updatedAt: '2026-11-16T10:00:00.123Z' };
const draft = (over: Partial<ReturnType<typeof draftFromProduct>> = {}) => ({ ...draftFromProduct(rice), ...over });

describe('priceToDigits', () => {
  it('turns the price into the masked text without float math', () => {
    expect(priceToDigits(25.5)).toBe('25,50');
    expect(priceToDigits('25.50')).toBe('25,50');
    expect(priceToDigits('0.05')).toBe('0,05');
    expect(priceToDigits(10)).toBe('10,00');
  });
});

describe('buildProductPatch', () => {
  it('returns null when nothing changed', () => {
    expect(buildProductPatch(rice, draft())).toBeNull();
  });

  it('sends only the name when only the name changed, with expectedUpdatedAt', () => {
    expect(buildProductPatch(rice, draft({ name: '  Arroz 1kg ' }))).toEqual({ name: 'Arroz 1kg', expectedUpdatedAt: rice.updatedAt });
  });

  it('sends the price as a decimal string, never a number', () => {
    const patch = buildProductPatch(rice, draft({ price: '30,05' }));
    expect(patch).toEqual({ salePrice: '30.05', expectedUpdatedAt: rice.updatedAt });
    expect(typeof patch?.salePrice).toBe('string');
  });

  it('trims the barcode', () => {
    expect(buildProductPatch(rice, draft({ barcode: ' 123 ' }))?.barcode).toBe('123');
  });

  it('leaves expectedUpdatedAt out when the item has none', () => {
    const { updatedAt: _omit, ...noStamp } = rice;
    expect(buildProductPatch(noStamp, draft({ name: 'Novo' }))).toEqual({ name: 'Novo' });
  });
});

describe('isDraftValid', () => {
  it('refuses a one letter name, an empty barcode and an empty or zero price', () => {
    expect(isDraftValid(draft())).toBe(true);
    expect(isDraftValid(draft({ name: 'A' }))).toBe(false);
    expect(isDraftValid(draft({ barcode: '  ' }))).toBe(false);
    expect(isDraftValid(draft({ price: '' }))).toBe(false);
  });
});

describe('change warnings', () => {
  it('show only while the value differs from the original', () => {
    expect(barcodeChanged(rice, draft({ barcode: '1' }))).toBe(true);
    expect(barcodeChanged(rice, draft({ barcode: ' 789 ' }))).toBe(false);
    expect(priceChanged(rice, draft({ price: '26,00' }))).toBe(true);
    expect(priceChanged(rice, draft())).toBe(false);
  });

  it('have the texts of the plan', () => {
    expect(BARCODE_CHANGE_WARNING).toContain('As etiquetas impressas com o código antigo deixam de funcionar');
    expect(PRICE_CHANGE_WARNING).toContain('Caixas sem internet ainda vendem pelo preço antigo');
  });
});

describe('editErrorMessage', () => {
  it('PRODUCT_CHANGED asks to reload', () => {
    expect(editErrorMessage(new ApiError(409, 'x', undefined, 'PRODUCT_CHANGED'))).toEqual({
      text: 'Este produto foi alterado por outra pessoa depois que você abriu a edição. Recarregue a lista e edite de novo.',
      reload: true,
    });
  });
  it('404 asks to reload', () => {
    expect(editErrorMessage(new ApiError(404, 'x'))).toEqual({ text: 'Este produto não existe mais na lista. Recarregue a lista.', reload: true });
  });
  it('403 does not reload', () => {
    expect(editErrorMessage(new ApiError(403, 'x'))).toEqual({ text: 'Só a proprietária pode editar produtos.', reload: false });
  });
  it('400 joins the details', () => {
    const err = new ApiError(400, 'Dados inválidos.', [{ field: 'salePrice', message: 'Preço inválido' }]);
    expect(editErrorMessage(err)).toEqual({ text: 'Dados inválidos. (Preço inválido)', reload: false });
  });
  it('409 without code shows the server message', () => {
    expect(editErrorMessage(new ApiError(409, 'Código já usado.'))).toEqual({ text: 'Código já usado.', reload: false });
  });
  it('anything else falls back', () => {
    expect(editErrorMessage('boom')).toEqual({ text: 'Erro ao editar produto.', reload: false });
  });
});

describe('submitProductEdit', () => {
  it('calls update with the id and only the patch, and returns the saved item', async () => {
    const saved = { ...rice, name: 'Novo', updatedAt: '2026-11-16T11:00:00.000Z' };
    const update = vi.fn().mockResolvedValue(saved);
    const result = await submitProductEdit(update, rice, draft({ name: 'Novo' }));
    expect(update).toHaveBeenCalledWith('a', { name: 'Novo', expectedUpdatedAt: rice.updatedAt });
    expect(result).toEqual({ kind: 'saved', item: saved });
  });

  it('does not call the API when nothing changed', async () => {
    const update = vi.fn();
    expect(await submitProductEdit(update, rice, draft())).toEqual({ kind: 'nochange' });
    expect(update).not.toHaveBeenCalled();
  });

  it('turns an error into a failed result', async () => {
    const update = vi.fn().mockRejectedValue(new ApiError(409, 'x', undefined, 'PRODUCT_CHANGED'));
    const result = await submitProductEdit(update, rice, draft({ name: 'Novo' }));
    expect(result).toMatchObject({ kind: 'failed', reload: true });
  });
});
