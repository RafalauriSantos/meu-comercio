import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readScreenSource } from '@/test-utils/read-screen-source';
import { ApiError } from '@/frontend/lib/api-client';
import { isInactiveProductError, isRegistrableCode, isUnknownCodeError, newProductError, registeredNotice } from './register-on-scan';
import { RegisterOnScanPanel } from './register-on-scan-panel';
import type { useRegisterOnScan } from './use-register-on-scan';

describe('what opens the panel', () => {
  it('a deactivated product (404 PRODUCT_INACTIVE) never opens the panel: it is a warning (22.17c)', () => {
    const inactive = new ApiError(404, 'Produto "Azeite" está desativado.', undefined, 'PRODUCT_INACTIVE');
    expect(isUnknownCodeError(inactive)).toBe(false);
    expect(isInactiveProductError(inactive)).toBe(true);
    expect(isInactiveProductError(new ApiError(404, 'Produto não encontrado.'))).toBe(false);
  });

  it('opens only for a 404 of the lookup, never for a network, timeout or server failure', () => {
    expect(isUnknownCodeError(new ApiError(404, 'Produto não encontrado.'))).toBe(true);
    expect(isUnknownCodeError(new ApiError(0, 'Sem conexão', undefined, undefined, 'network'))).toBe(false);
    expect(isUnknownCodeError(new ApiError(0, 'Lento', undefined, undefined, 'timeout'))).toBe(false);
    expect(isUnknownCodeError(new ApiError(500, 'Erro'))).toBe(false);
    expect(isUnknownCodeError(new Error('Failed to fetch'))).toBe(false);
  });

  it('opens only for digits of barcode length: a name or a short text typed in the field never does', () => {
    expect(isRegistrableCode('7891234567895')).toBe(true);
    expect(isRegistrableCode('1234')).toBe(true);
    expect(isRegistrableCode('123')).toBe(false);
    expect(isRegistrableCode('arroz')).toBe(false);
    expect(isRegistrableCode('12ab34')).toBe(false);
  });
});

describe('the form of a new product on the sales screen', () => {
  it('asks for a name of 2 letters or more and a price above zero', () => {
    expect(newProductError({ name: 'Arroz', price: '24,90' })).toBeNull();
    expect(newProductError({ name: ' A ', price: '24,90' })).toMatch(/nome/);
    expect(newProductError({ name: 'Arroz', price: '' })).toMatch(/maior que zero/);
    expect(newProductError({ name: 'Arroz', price: '0,00' })).toMatch(/maior que zero/);
  });

  it('says the product was registered and added', () => {
    expect(registeredNotice('Arroz')).toBe('Produto "Arroz" cadastrado e adicionado.');
  });
});

const noop = () => {};
const register = {
  isOpen: true,
  closing: false,
  barcode: '7891234567895',
  name: '',
  unit: 'UN',
  price: '',
  error: null,
  processing: false,
  nameRef: { current: null },
  open: noop,
  cancel: noop,
  finishClose: noop,
  setBarcode: noop,
  setName: noop,
  setUnit: noop,
  setPrice: noop,
  handleBarcodeKeyDown: noop,
  submit: noop,
} as unknown as ReturnType<typeof useRegisterOnScan>;

describe('RegisterOnScanPanel', () => {
  it('shows the scanned code, name, unit and price, no stock field, inside the management scope without a box of its own', () => {
    const html = renderToStaticMarkup(<RegisterOnScanPanel register={register} />);
    expect(html).toMatch(/^<div class="management-page" style="display:contents">/);
    expect(html).toContain('value="7891234567895"');
    expect(html).toContain('id="np-name"');
    expect(html).toContain('id="np-unit"');
    expect(html).toContain('id="np-price"');
    expect(html).not.toContain('np-stock');
  });

  it('disables the save button while saving, so a double click cannot save twice', () => {
    const html = renderToStaticMarkup(<RegisterOnScanPanel register={{ ...register, processing: true }} />);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Salvando\.\.\.<\/button>|<button[^>]*disabled=""[^>]*type="submit"/);
  });
});

describe('the sales screen wiring', () => {
  const pdv = readScreenSource('pdv').replace(/\r\n/g, '\n');

  it('counts the panel as an open window for the scan listener and for the global keys (Esc, F2, F4)', () => {
    expect(pdv).toContain('!!printModalData || register.isOpen;');
    expect(pdv).toContain('if (weightProduct || isCancelSaleOpen || register.isOpen) return;');
  });

  it('opens the panel from the 404 catch only, after the offline and the other failures kept the old notice', () => {
    expect(pdv).toContain('if (isUnknownCodeError(err) && isRegistrableCode(code)) {');
    expect(pdv).toContain("getErrorMessage(err, 'Produto não encontrado.')");
    expect(pdv).toContain('Produto com código [${code}] não encontrado no catálogo.');
  });

  it('puts the saved product in the cart with the same function as a scanned one (KG opens the weight window)', () => {
    expect(pdv).toMatch(/useRegisterOnScan\(\(product\) => \{[\s\S]*?registeredNotice\(product\.name\)[\s\S]*?addProductToCart\(product\);/);
  });

  it('does not import from the management feature (ADR-020) and takes no stock', () => {
    expect(pdv).not.toMatch(/from '@\/frontend\/management\//);
    expect(pdv).not.toContain('initialStock');
  });
});

describe('RegisterOnScanPanel barcode warnings (D-30)', () => {
  const html = (barcode: string) => renderToStaticMarkup(<RegisterOnScanPanel register={{ ...register, barcode }} />);

  it('a scanned valid code opens with no warning, only the green status', () => {
    const out = html('7891000100103');
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain('aria-invalid="true"');
    expect(out).toContain('Código válido (EAN-13)');
  });

  it('a scanned invalid code opens with the red warning and Salvar disabled', () => {
    const out = html('1234');
    expect(out).toContain('Um código de barras tem 8, 12, 13 ou 14 números. Você digitou 4.');
    const bad = html('12345678');
    expect(bad).toContain('role="alert"');
    expect(bad).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(bad).toContain('Corrija o código de barras, ou deixe em branco, para salvar.');
  });

  it('the empty help is the one for the sales screen', () => {
    expect(html('')).toContain('Bipe o produto ou digite o código. Em branco, o sistema gera um.');
  });
});
