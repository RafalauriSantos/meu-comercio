import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidBarcode } from '@/modules/products/domain/generated-barcode';
import { ImportProductsPanel } from './import-products-panel';

function render(stockControl: boolean) {
  return renderToStaticMarkup(<ImportProductsPanel stockControl={stockControl} onImported={() => {}} onClose={() => {}} />);
}

describe('ImportProductsPanel', () => {
  const markup = render(true);

  it('has one place to import the sheet, with what it accepts', () => {
    expect(markup).toContain('Importar produtos de uma planilha');
    expect(markup).toContain('Escolher a planilha');
    expect(markup).toContain('Excel (.xlsx) ou CSV');
    expect(markup).toContain('até 1.000 produtos');
    expect(markup).not.toContain('500');
    expect(markup.match(/type="file"/g)).toHaveLength(1);
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="\.xlsx,\.csv,text\/csv/);
  });

  it('has a Fechar button to hide the card', () => {
    expect(markup).toMatch(/<button[^>]*aria-label="Fechar a importação"[^>]*>Fechar<\/button>/);
  });

  it('has no template to download anymore: no link, no download', () => {
    expect(markup).not.toContain('Baixar planilha-modelo');
    expect(markup).not.toContain('mg-link');
    expect(markup).not.toContain('download');
    expect(markup).not.toContain('Escolher arquivo');
  });

  it('shows the example as a picture with the stock column when the stock control is on', () => {
    expect(markup).toContain('Como a planilha deve ficar');
    expect(markup).toContain('Exemplo, só para ver o formato');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Exemplo de planilha com as colunas Código de barras, Nome, Preço, Estoque e Unidade"');
    expect(markup).toContain('mg-sheet mg-sheet-stock');
    expect(markup).toContain('<span>Estoque</span>');
    expect(markup).toContain('<span>Queijo Mussarela</span>');
    expect(markup).toContain('<span>2,5</span>');
    expect(markup).toContain('<span>kg</span>');
    expect(markup).toContain('13, 12, 8 ou 14');
    expect(markup).toContain('É só um desenho: não há arquivo para baixar.');
    expect(markup).not.toContain('Estoque, se houver, é ignorada');
  });

  it('drops the stock column of the example, and says it is ignored, when the stock control is off', () => {
    const off = render(false);
    expect(off).toContain('aria-label="Exemplo de planilha com as colunas Código de barras, Nome, Preço e Unidade"');
    expect(off).not.toContain('mg-sheet-stock');
    expect(off).not.toContain('<span>Estoque</span>');
    expect(off).not.toContain('<span>2,5</span>');
    expect(off).toContain('<span>Arroz Tipo 1 5kg</span>');
    expect(off).toContain('a coluna Estoque, se houver, é ignorada');
  });

  it('shows only valid barcodes in the example', () => {
    const codes = [...markup.matchAll(/<span>(\d{8,14})<\/span>/g)].map((m) => m[1]);
    expect(codes).toHaveLength(3);
    for (const code of codes) expect(isValidBarcode(code)).toBe(true);
  });

  it('explains that products with the same barcode are corrected, without promising an export button', () => {
    expect(markup).toContain(
      'Corrija os nomes e os preços na sua planilha e importe: produtos com o mesmo código de barras são corrigidos. O estoque da planilha é ignorado nos produtos que já existem. Até 1.000 produtos.'
    );
    expect(markup).not.toContain('Baixe a planilha');
    expect(markup).not.toContain('Exportar');
    expect(markup).not.toContain('não são alterados');
  });

  it('starts with nothing to confirm and no alert', () => {
    expect(markup).not.toContain('Confirmar e gravar');
    expect(markup).not.toContain('role="alert"');
  });
});
