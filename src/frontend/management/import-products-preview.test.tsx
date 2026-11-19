import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductImportReport } from '@/frontend/lib/api-client';
import { ImportProductsPreview } from './import-products-preview';

type Corrected = ProductImportReport['corrected'][number];

function fix(n: number, over50 = false): Corrected {
  return {
    line: n + 1,
    barcode: `789100010${String(n).padStart(4, '0')}`,
    unit: 'UN',
    before: { name: `Arroz velho ${n}`, salePrice: '24.90' },
    after: { name: `Arroz novo ${n}`, salePrice: over50 ? '78.00' : '26.90' },
    priceChangeOver50: over50,
  };
}

function report(patch: Partial<ProductImportReport> = {}): ProductImportReport {
  return { valid: [], corrected: [], unchanged: [], skipped: [], errors: [], imported: false, ...patch };
}

function render(r: ProductImportReport, extra: { onlyNames?: boolean; done?: boolean; busy?: boolean } = {}) {
  return renderToStaticMarkup(
    <ImportProductsPreview
      report={r}
      stockControl
      onlyNames={extra.onlyNames ?? false}
      done={extra.done ?? false}
      busy={extra.busy ?? false}
      onToggleOnlyNames={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

const confirmButton = (markup: string) => markup.match(/<button[^>]*>Confirmar e gravar<\/button>/)?.[0] ?? '';

describe('ImportProductsPreview', () => {
  const valid = { line: 2, barcode: '7891000100103', name: 'Novo', salePrice: '5.00', unit: 'UN' as const, initialStock: 1 };
  const withFixes = report({
    valid: [valid, { ...valid, line: 3 }],
    corrected: Array.from({ length: 30 }, (_, i) => fix(i, i === 4)),
    unchanged: Array.from({ length: 31 }, (_, i) => ({ line: i, barcode: `b${i}`, name: 'x' })),
    skipped: [{ line: 9, barcode: '7891000900901', name: 'Sal', reason: 'Produto excluído: não é alterado nem recriado.' }],
  });
  const markup = render(withFixes);

  it('shows the five numbers', () => {
    for (const label of ['Novos', 'Corrigidos', 'Sem mudança', 'Ignorados', 'Com erro']) expect(markup).toContain(label);
    expect(markup).toMatch(/>2<\/div><div[^>]*>Novos</);
    expect(markup).toMatch(/>30<\/div><div[^>]*>Corrigidos</);
    expect(markup).toMatch(/>31<\/div><div[^>]*>Sem mudança</);
    expect(markup).toMatch(/>1<\/div><div[^>]*>Ignorados</);
    expect(markup).toMatch(/>0<\/div><div[^>]*>Com erro</);
  });

  it('lists every correction, before and after, in a scrollable region', () => {
    expect(markup).toContain('Produtos a corrigir: antes e depois');
    expect(markup).toMatch(/<div[^>]*role="region"[^>]*aria-label="Lista de correções, antes e depois"[^>]*tabindex="0"/);
    expect(markup.match(/Arroz velho \d+/g)).toHaveLength(30);
    expect(markup).toContain('Arroz novo 29');
    expect(markup).toContain('R$');
    expect(markup).toContain('Mostrando todas as 30 correções');
  });

  it('warns only on the rows whose price moved by more than 50%', () => {
    expect(markup.match(/Preço mudou mais de 50%/g)).toHaveLength(1);
  });

  it('with only names, keeps the new price struck through as "mantido" and drops the 50% warning', () => {
    const kept = render(withFixes, { onlyNames: true });
    expect(kept).not.toContain('Preço mudou mais de 50%');
    expect(kept.match(/mantido/g)).toHaveLength(30);
    expect(kept).toContain('<s ');
    expect(markup).not.toContain('mantido');
    expect(kept).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(markup).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(kept).toContain('Corrigir só os nomes, não mexer nos preços');
  });

  it('shows the reason of each ignored (deleted) product', () => {
    expect(markup).toContain('Sal');
    expect(markup).toContain('Produto excluído: não é alterado nem recriado.');
  });

  it('enables Confirmar e gravar when there is something to create or correct and no error', () => {
    expect(confirmButton(markup)).not.toContain('disabled');
    expect(confirmButton(render(report({ valid: [valid] })))).not.toContain('disabled');
    expect(confirmButton(render(report({ corrected: [fix(1)] })))).not.toContain('disabled');
    expect(markup).not.toContain('role="alert"');
    expect(markup).toContain('Cancelar');
  });

  it('blocks the confirmation, with an alert, while there is an error', () => {
    const bad = render(
      report({ corrected: [fix(1)], errors: [{ line: 12, message: 'unidade diferente da cadastrada (kg)' }] })
    );
    expect(confirmButton(bad)).toContain('disabled');
    expect(bad).toMatch(/role="alert"/);
    expect(bad).toContain('Nada foi gravado enquanto houver erro.');
    expect(bad).toContain('Linha 12: unidade diferente da cadastrada (kg)');
    expect(bad).toContain('Corrija na planilha e escolha o arquivo de novo.');
  });

  it('says nothing needs correcting, and blocks the confirmation, when only unchanged rows came', () => {
    const none = render(report({ unchanged: [{ line: 2, barcode: 'b', name: 'x' }] }));
    expect(confirmButton(none)).toContain('disabled');
    expect(none).toMatch(/role="status"[^>]*><strong>Nenhum produto precisa de correção\./);
    expect(none).not.toContain('Produtos a corrigir');
    expect(none).not.toContain('role="alert"');
  });

  it('after confirming, shows the final numbers from the server in a status and no more actions', () => {
    const done = render(report({ valid: [valid, { ...valid, line: 3 }], corrected: Array.from({ length: 8 }, (_, i) => fix(i)), imported: true }), {
      done: true,
    });
    expect(done).toMatch(/role="status"[^>]*><strong>Pronto\. 8 produtos corrigidos, 2 novos\.</);
    expect(done).not.toContain('Confirmar e gravar');
    expect(done).not.toContain('Cancelar');
    expect(done).not.toContain('type="checkbox"');
    expect(done).toContain('Corrigidos');
  });

  it('uses the singular in the final message', () => {
    const done = render(report({ valid: [valid], corrected: [fix(1)], imported: true }), { done: true });
    expect(done).toContain('Pronto. 1 produto corrigido, 1 novo.');
  });

  it('disables the checkbox and the buttons while busy', () => {
    const busy = render(withFixes, { busy: true });
    expect(confirmButton(busy)).toContain('disabled');
    expect(busy).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
  });
});
