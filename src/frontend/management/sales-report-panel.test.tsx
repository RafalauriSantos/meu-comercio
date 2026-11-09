import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesReportPanel } from './sales-report-panel';

describe('SalesReportPanel', () => {
  const markup = renderToStaticMarkup(<SalesReportPanel />);

  it('opens on today, with the five periods to choose from', () => {
    expect(markup).toContain('Relatório de vendas');
    for (const label of ['Hoje', 'Ontem', 'Esta semana', 'Este mês', 'Personalizado']) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Hoje</);
    expect(markup).not.toMatch(/aria-pressed="true"[^>]*>Ontem</);
  });

  it('says it is loading, and has nothing to export until the report arrives', () => {
    expect(markup).toContain('Carregando o relatório');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Exportar CSV<\/button>/);
  });

  it('shows no custom dates until "Personalizado" is chosen', () => {
    expect(markup).not.toContain('id="report-from"');
  });
});

describe('the sales report API', () => {
  const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'reports', 'sales', 'route.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('is for the owner only, and answers 403 to anyone else', () => {
    expect(route).toContain('isSessionOwner(session)');
    expect(route).toContain('status: 403');
  });

  it('refuses a bad period with 400 and a message, and never caches the answer', () => {
    expect(route).toContain('InvalidPeriodError');
    expect(route).toContain('status: 400');
    expect(route).toContain("'Cache-Control': 'no-store'");
  });

  it('stays out of the build, like the other handlers that read the database', () => {
    expect(route).toContain('await connection();');
  });

  it('only reads the shop of the session: the shop id comes from the session, never from the request', () => {
    expect(route).toContain('session.merchantId');
    expect(route).not.toMatch(/searchParams\.get\(['"]merchant/i);
  });
});
