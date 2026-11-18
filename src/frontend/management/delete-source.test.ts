import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// No jsdom: what the hooks and the dialog wire together is locked by reading the code.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const customerHook = read('use-customer-edit.ts');
const productHook = read('use-product-edit.ts');
const customersTab = read('use-customers-tab.ts');
const productsTab = read('use-products-tab.ts');
const confirmHook = read('use-delete-confirm.ts');
const dialog = read('delete-pieces.tsx');

describe('Excluir and Restaurar (source locks)', () => {
  it('the confirmation is a modal alert dialog: focus on Cancelar, Esc cancels (not while sending)', () => {
    expect(dialog).toMatch(/role="alertdialog"/);
    expect(dialog).toContain('dialog.showModal()');
    expect(dialog).toContain('cancelRef.current?.focus()');
    expect(dialog).toMatch(/onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(!processing\) onCancel\(\);/);
  });

  it('the PIN field is a password field, numeric, six digits, only for a customer', () => {
    expect(dialog).toMatch(/type="password"\s+inputMode="numeric"\s+autoComplete="off"\s+maxLength=\{6\}/);
    expect(dialog).toContain("const needPin = kind === 'customer';");
  });

  it('a customer is excluded with the PIN, which is dropped before the answer; a product sends no PIN', () => {
    expect(customerHook).toMatch(/const ownerPin = del\.pin;\s*del\.clearPin\(\);/);
    expect(customerHook).toContain('submitCustomerActive(apiClient.updateCustomer, target, false, ownerPin)');
    expect(productHook).toContain('submitProductActive(apiClient.updateProduct, target, false)');
    expect(productHook).not.toContain('ownerPin');
  });

  it('closing the panel or the window drops the PIN, and the PIN is never logged', () => {
    expect(confirmHook).toMatch(/function reset\(\) \{\s*setAsking\(false\);\s*setPin\(''\);/);
    expect(customerHook).toMatch(/function close\(\) \{\s*setClosing\(true\);\s*del\.reset\(\);/);
    for (const code of [customerHook, confirmHook, dialog, read('deactivate.ts')]) {
      expect(code).not.toMatch(/console\.\w+\([^)]*[pP]in/);
    }
  });

  it('after a delete the panel closes with the green notice; a restore needs no PIN and no confirmation', () => {
    for (const hook of [customerHook, productHook]) {
      expect(hook).toMatch(/setFeedback\(\{ text: deletedNotice\(target\.name\), isSuccess: true \}\);\s*close\(\);/);
    }
    expect(customersTab).toContain('submitCustomerActive(apiClient.updateCustomer, customer, true)');
    expect(productsTab).toContain('submitProductActive(apiClient.updateProduct, product, true)');
  });

  it('the excluded lists are read only when the owner opens the filter, so the first load has no new request', () => {
    expect(customersTab).toMatch(/showDeletedList: \(\) => \{\s*setShowDeleted\(true\);\s*void loadDeleted\(\);/);
    expect(productsTab).toMatch(/showDeletedList: \(\) => \{\s*setShowDeleted\(true\);\s*void loadDeleted\(\);/);
    expect(read('../../app/gestao/page.tsx')).not.toContain('loadDeleted');
  });
});
