import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// No jsdom: what the hook and the tab wire together is locked by reading the code.
const source = readScreenSource('gestao').replace(/\r\n/g, '\n');

describe('product edit (source locks)', () => {
  it('only the owner sees the Editar button', () => {
    expect(source).toMatch(/\{user\?\.isOwner && \(\s*<button\s+type="button"\s+className="outline mg-row-action"\s+aria-expanded=\{edit\.targetId === p\.id\}/);
    expect(source).toContain('aria-label={`Editar ${p.name}`}');
  });

  it('the Enter of the barcode reader does not submit the edit form', () => {
    expect(source).toMatch(/if \(e\.key !== 'Enter'\) return;\s*e\.preventDefault\(\);\s*void checkBarcode/);
  });

  it('edit and new product are never open together, and search and filter close the edit', () => {
    expect(source).toMatch(/function startEdit[\s\S]*?setShowNewProduct\(false\)[\s\S]*?edit\.open\(/);
    expect(source).toMatch(/onClick=\{\(\) => \{\s*edit\.close\(\);\s*setShowNewProduct\(!showNewProduct\);/);
    expect(source).toMatch(/setProductQuery\(e\.target\.value\);\s*edit\.close\(\);/);
    expect(source).toMatch(/setStockFilter\(f\.value\);\s*edit\.close\(\);/);
  });

  it('a scan with the edit open only warns', () => {
    expect(source).toMatch(/if \(edit\.targetId\) \{\s*setFeedback\(\{ text: SCAN_DURING_EDIT_NOTICE \}\);\s*return;/);
    expect(source).toContain('Termine ou cancele a edição antes de cadastrar um produto novo.');
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
