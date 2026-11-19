import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { countCsvRows, exportedText } from './export-products';
import { ExportProductsButton, ExportNotice } from './export-products-view';

describe('countCsvRows', () => {
  it('counts the data lines, not the title line nor the empty lines', () => {
    expect(countCsvRows('codigo,nome\n1,A\n2,B\n\n3,C\r\n\r\n')).toBe(3);
  });

  it('counts a name with a line break inside quotes as one product', () => {
    expect(countCsvRows('codigo,nome\n1,"A\nB"\n2,C\n')).toBe(2);
  });

  it('is zero for only the title line', () => {
    expect(countCsvRows('codigo,nome\n')).toBe(0);
  });
});

describe('exportedText', () => {
  it('says the number and the file', () => {
    expect(exportedText(5, 'produtos-2026-11-19.csv')).toBe('Planilha baixada: 5 produtos ativos. Arquivo produtos-2026-11-19.csv');
    expect(exportedText(1, 'a.csv')).toBe('Planilha baixada: 1 produto ativo. Arquivo a.csv');
  });

  it('does not invent a number when it could not be read', () => {
    expect(exportedText(null, 'a.csv')).toBe('Planilha baixada. Arquivo a.csv');
  });
});

describe('ExportProductsButton', () => {
  it('normal: Exportar planilha, enabled, same family as Importar', () => {
    const html = renderToStaticMarkup(<ExportProductsButton busy={false} onClick={() => {}} />);
    expect(html).toMatch(/class="outline mg-toolbar-import mg-toolbar-export"[^>]*>Exportar planilha</);
    expect(html).not.toContain('disabled');
  });

  it('busy: disabled and says Gerando a planilha…', () => {
    const html = renderToStaticMarkup(<ExportProductsButton busy onClick={() => {}} />);
    expect(html).toContain('disabled');
    expect(html).toContain('>Gerando a planilha…<');
  });
});

describe('ExportNotice', () => {
  it('shows nothing at first', () => {
    expect(renderToStaticMarkup(<ExportNotice busy={false} notice={null} />)).toBe('');
  });

  it('busy: a status', () => {
    expect(renderToStaticMarkup(<ExportNotice busy notice={null} />)).toMatch(/role="status"[^>]*>Gerando a planilha…</);
  });

  it('success: a green status with the text', () => {
    const html = renderToStaticMarkup(
      <ExportNotice busy={false} notice={{ error: false, text: 'Planilha baixada: 5 produtos ativos. Arquivo a.csv' }} />
    );
    expect(html).toContain('class="success"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Planilha baixada: 5 produtos ativos. Arquivo a.csv');
  });

  it.each(['Não há produtos para exportar.', 'A planilha exporta até 1.000 produtos e a loja tem 1.240. Fale com o suporte.'])(
    'error: an alert with the message of the server (%s)',
    (text) => {
      const html = renderToStaticMarkup(<ExportNotice busy={false} notice={{ error: true, text }} />);
      expect(html).toContain('role="alert"');
      expect(html).toContain('class="error"');
      expect(html).toContain(text);
    }
  );
});
