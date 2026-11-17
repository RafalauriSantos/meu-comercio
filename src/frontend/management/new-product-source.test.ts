import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// No jsdom: what the hook and the tab wire together is locked by reading the code.
const source = readScreenSource('gestao').replace(/\r\n/g, '\n');

describe('new product panel (source locks)', () => {
  it('the toolbar button only opens the panel (it no longer toggles Cancelar)', () => {
    expect(source).toMatch(/onClick=\{\(\) => \{\s*edit\.close\(\);\s*setShowNewProduct\(true\);\s*\}\}/);
    expect(source).not.toContain("showNewProduct ? 'Cancelar'");
    expect(source).toMatch(/className="primary mg-toolbar-new"\s+aria-haspopup="dialog"/);
  });

  it('the panel is mounted by the tab only while showNewProduct, and the old inline form is gone', () => {
    expect(source).toMatch(/\{showNewProduct && \(\s*<NewProductPanel/);
    expect(source).not.toContain('Cadastrar Novo Produto');
    expect(source).not.toMatch(/<form onSubmit=\{handleCreateProduct\} className="card">/);
  });

  it('the panel is a modal dialog panel: showModal, Esc handled by the app, first focus on the barcode', () => {
    expect(source).toMatch(/<dialog[\s\S]*?ref=\{dialogRef\}[\s\S]*?className="mg-panel"[\s\S]*?aria-labelledby=\{titleId\}/);
    expect(source).toContain('useDialogPanel(dialogRef, barcodeRef)');
    expect(source).toMatch(/id="np-barcode"[\s\S]*?ref=\{barcodeRef\}/);
    expect(source).toContain('onSubmit={onSubmit}');
  });

  it('a scan with the panel closed opens it with the code and puts the cursor on the name', () => {
    expect(source).toMatch(/setNewBarcode\(code\);\s*setShowNewProduct\(true\);\s*setNameFocusRequest/);
    expect(source).toContain('newNameRef.current?.focus()');
  });

  it('a scan with the new panel open only warns inside it, and never opens a second panel', () => {
    expect(source).toMatch(/if \(showNewProduct\) \{\s*setNewScanWarning\(true\);\s*return;/);
    expect(source).toContain('scanWarning={tab.newScanWarning}');
  });

  it('a taken code scanned with the panel closed still warns in the page feedback', () => {
    expect(source).toMatch(/if \(existing\) \{\s*setFeedback\(\{ text: takenBarcodeMessage\(existing\), isError: true \}\);/);
  });

  it('opening an edit closes the new panel, and saving closes it and clears the scan warning and the error', () => {
    expect(source).toMatch(/function startEdit[\s\S]*?closeNewProduct\(\)[\s\S]*?edit\.open\(/);
    expect(source).toMatch(/function closeNewProduct\(\) \{\s*setShowNewProduct\(false\);\s*setNewScanWarning\(false\);\s*setCreateError\(null\);/);
    expect(source).toMatch(/setProductQuery\(''\);\s*closeNewProduct\(\);/);
  });

  it('the creation errors show inside the panel (the page feedback is behind the modal)', () => {
    expect(source).toMatch(/setCreateError\(getErrorMessage\(err, 'Erro ao cadastrar produto\.'\)\)/);
    expect(source).toContain('error={tab.createError}');
  });

  it('the scanner Enter in the barcode field does not submit the form', () => {
    expect(source).toMatch(/if \(e\.key !== 'Enter'\) return;\s*e\.preventDefault\(\);\s*void checkNewBarcode/);
  });
});
