import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportProductsPanel } from './import-products-panel';

describe('ImportProductsPanel', () => {
  it('starts with the template and the file field, and nothing to confirm yet', () => {
    const markup = renderToStaticMarkup(<ImportProductsPanel onImported={() => {}} />);

    expect(markup).toContain('Importar produtos de uma planilha');
    expect(markup).toContain('Baixar planilha-modelo');
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="\.csv,text\/csv"/);
    expect(markup).toContain('até 500 produtos');
    expect(markup).not.toContain('Importar 0 produtos');
    expect(markup).not.toContain('role="alert"');
  });
});
