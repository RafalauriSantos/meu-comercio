import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportProductsPanel } from './import-products-panel';

describe('ImportProductsPanel', () => {
  const markup = renderToStaticMarkup(<ImportProductsPanel stockControl onImported={() => {}} />);

  it('has one place to import the sheet, with what it accepts', () => {
    expect(markup).toContain('Importar produtos de uma planilha');
    expect(markup).toContain('Escolher a planilha');
    expect(markup).toContain('Excel (.xlsx) ou CSV');
    expect(markup).toContain('até 500 produtos');
    expect(markup.match(/type="file"/g)).toHaveLength(1);
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="\.xlsx,\.csv,text\/csv/);
  });

  it('offers the template as a small link, not as another button next to the import', () => {
    expect(markup).toMatch(/<button[^>]*class="mg-link"[^>]*>Baixar planilha-modelo<\/button>/);
    expect(markup).not.toContain('class="outline"');
    expect(markup).not.toContain('Escolher arquivo');
  });

  it('starts with nothing to confirm and no alert', () => {
    expect(markup).not.toContain('Importar 0 produtos');
    expect(markup).not.toContain('role="alert"');
  });
});
