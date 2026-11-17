import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// No jsdom: what the hook and the tab wire together is locked by reading the code.
const source = readScreenSource('gestao').replace(/\r\n/g, '\n');

describe('product edit (source locks)', () => {
  it('only the owner sees the Editar button', () => {
    expect(source).toMatch(/\{user\?\.isOwner && \(\s*<button\s+type="button"\s+className="outline mg-row-action"\s+aria-haspopup="dialog"/);
    expect(source).toContain('aria-label={`Editar ${p.name}`}');
    // Editar has its own cell (the one after the price), not the product cell.
    expect(source).toMatch(/<div role="cell" className="mg-row-end">\s*\{user\?\.isOwner && \(\s*<button/);
  });

  it('the Enter of the barcode reader does not submit the edit form', () => {
    expect(source).toMatch(/if \(e\.key !== 'Enter'\) return;\s*e\.preventDefault\(\);\s*void checkBarcode/);
  });

  it('edit and new product are never open together, and search and filter close the edit', () => {
    expect(source).toMatch(/function startEdit[\s\S]*?closeNewProduct\(\)[\s\S]*?edit\.open\(/);
    expect(source).toMatch(/onClick=\{\(\) => \{\s*edit\.close\(\);\s*openNewProduct\(\);/);
    expect(source).toMatch(/setProductQuery\(e\.target\.value\);\s*edit\.close\(\);/);
    expect(source).toMatch(/setStockFilter\(f\.value\);\s*edit\.close\(\);/);
  });

  it('a scan with the edit open only warns', () => {
    // The notice shows inside the panel: the page feedback is behind the modal.
    expect(source).toMatch(/if \(edit\.targetId\) \{\s*setScanWarning\(true\);\s*return;/);
    expect(source).toContain('Termine ou cancele a edição antes de cadastrar um produto novo.');
  });

  it('the edit is a modal dialog panel: opened by showModal, Esc handled by the app, focus given back', () => {
    expect(source).toMatch(/<dialog[\s\S]*?ref=\{dialogRef\}[\s\S]*?className="mg-panel"[\s\S]*?aria-labelledby=\{titleId\}/);
    expect(source).toMatch(/onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onCancel\(\);/);
    expect(source).toContain('useDialogPanel(dialogRef, nameRef, closing, onClosed)');
    expect(source).toContain('aria-label="Fechar"');
    // Closing on the dimmed background is left out on purpose: a stray click would lose what was typed.
    expect(source).not.toMatch(/e\.target === e\.currentTarget/);
  });

  it('closing keeps the target until the panel ends its exit, and opening again cancels the closing', () => {
    expect(source).toMatch(/function close\(\) \{\s*setClosing\(true\);\s*\}/);
    expect(source).toMatch(/function finishClose\(\) \{\s*setTarget\(null\);\s*setClosing\(false\);/);
    expect(source).toMatch(/function open\(product: ProductItem\) \{\s*setClosing\(false\);/);
    expect(source).toContain('targetId: target && !closing ? target.id : null');
    expect(source).toContain('onClosed={edit.finishClose}');
    expect(source).toContain('closing={edit.closing}');
  });

  it('saving swaps the item, reads the summary again and confirms in green', () => {
    expect(source).toMatch(/function applyEdit\(item: ProductItem\) \{[\s\S]*?replaceProduct\(cur\.items, item\)[\s\S]*?void loadSummary\(\)/);
    expect(source).toContain("text: 'Produto atualizado.', isSuccess: true");
  });

  it('sends expectedUpdatedAt through the patch and calls the api only through submitProductEdit', () => {
    expect(source).toContain('submitProductEdit(apiClient.updateProduct,');
    expect(source).toContain('expectedUpdatedAt');
  });
});
