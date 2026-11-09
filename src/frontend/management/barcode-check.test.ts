import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError, type ProductItem } from '@/frontend/lib/api-client';
import { findProductWithBarcode, takenBarcodeMessage } from './barcode-check';

const rice: ProductItem = { id: 'p1', barcode: '789', name: 'Arroz 5kg', salePrice: 25.5, availableQuantity: 10 };

describe('findProductWithBarcode', () => {
  it('returns the product that already has the code', async () => {
    const lookup = vi.fn().mockResolvedValue(rice);

    expect(await findProductWithBarcode(lookup, ' 789 ')).toEqual(rice);
    expect(lookup).toHaveBeenCalledWith('789');
  });

  it('returns null when the code is free (the server says 404)', async () => {
    const lookup = vi.fn().mockRejectedValue(new ApiError(404, 'Produto não encontrado.'));

    expect(await findProductWithBarcode(lookup, '999')).toBeNull();
  });

  it('does not ask the server for an empty code', async () => {
    const lookup = vi.fn();

    expect(await findProductWithBarcode(lookup, '   ')).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('lets any other failure through, so it is not mistaken for a free code', async () => {
    const lookup = vi.fn().mockRejectedValue(new ApiError(500, 'Erro interno.'));

    await expect(findProductWithBarcode(lookup, '789')).rejects.toBeInstanceOf(ApiError);
  });

  it('says which product has the code', () => {
    expect(takenBarcodeMessage(rice)).toBe('Este código já está cadastrado: Arroz 5kg.');
  });
});

describe('registering a product with the barcode scanner', () => {
  const page = readFileSync(join(process.cwd(), 'src', 'app', 'gestao', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('puts the cursor in the barcode field when the form opens', () => {
    expect(page).toMatch(/id="np-barcode"[\s\S]*?autoFocus/);
  });

  it('does not submit the form on the scanner Enter: it checks the code and goes to the name', () => {
    expect(page).toContain("if (e.key !== 'Enter') return;\n    e.preventDefault();");
    expect(page).toContain('newNameRef.current?.focus();');
    expect(page).toContain('ref={newNameRef}');
  });

  it('warns about a code that is already taken, also when it is typed and the field loses the focus', () => {
    expect(page).toContain('onBlur={(e) => void checkNewBarcode(e.target.value)}');
    expect(page).toContain('mg-help mg-help-warn');
  });
});
