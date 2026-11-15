import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

// The server HTML of /pdv is what renderToStaticMarkup gives: effects do not run, so the page is in its
// initial state (no user, loading). `gate.override` lets a test force the 'wait' phase of the delay gate.
const { gate } = vi.hoisted(() => ({ gate: { override: null as null | 'wait' | 'skeleton' | 'content' } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/frontend/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: new Proxy({}, { get: () => vi.fn(() => new Promise(() => {})) }),
}));
vi.mock('@/frontend/lib/use-skeleton-gate', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/frontend/lib/use-skeleton-gate')>();
  return { ...real, useSkeletonGate: (loading: boolean, delayMs?: number) => gate.override ?? real.useSkeletonGate(loading, delayMs) };
});

import PdvPage from './page';

const source = readFileSync(join(process.cwd(), 'src', 'app', 'pdv', 'page.tsx'), 'utf8');

function count(text: string, needle: string | RegExp): number {
  return typeof needle === 'string' ? text.split(needle).length - 1 : (text.match(needle) ?? []).length;
}

function html(override: typeof gate.override): string {
  gate.override = override;
  return renderToStaticMarkup(<PdvPage />);
}

// Text that depends on data or on the user, and so cannot be in the HTML the server sends.
const UNKNOWN = ['Dona', 'Operador', 'Caixa fechado', 'Fechado', 'Aberto', 'R$', '(0)', 'Sem conexão'];

describe('/pdv first paint (server HTML, first visit)', () => {
  const markup = html(null);

  it('has the real shell: frame, brand, links, current page and Sair', () => {
    expect(markup).toContain('pdv-app');
    expect(markup).toContain('pdv-main');
    expect(markup).toContain('aria-label="Venda atual"');
    expect(markup).toContain('Meu Comércio');
    expect(markup).toMatch(/<a[^>]*href="\/pdv"[^>]*>Venda<\/a>/);
    expect(markup).toMatch(/<a[^>]*href="\/gestao"[^>]*>Gestão<\/a>/);
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>Venda<\/a>/);
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
  });

  it('has the skeleton shape in the data areas, announced once across the three pieces', () => {
    expect(markup).toContain('class="skeleton');
    expect(count(markup, 'role="status"')).toBe(1);
    expect(count(markup, 'aria-busy="true"')).toBe(1);
    expect(count(markup, 'sr-only')).toBe(1);
    expect(markup).toContain('Carregando o terminal de vendas');
    for (const part of ['pdv-cart', 'pdv-total-card', 'pdv-methods-card', 'pdv-status']) expect(markup).toContain(part);
  });

  it('has no gray block in place of the header', () => {
    expect(markup).not.toContain('app-header-skeleton');
    expect(markup).not.toContain('app-nav-skeleton');
  });

  it('does not have the barcode field yet (it is still part of the data area until the A3 step)', () => {
    expect(markup).not.toContain('<input id="barcode-scanner"');
    expect(markup).not.toContain('id="barcode-scanner"');
  });

  it('has no data the server cannot know, and the page does not throw while loading', () => {
    expect(markup).toContain('Meu Comércio'); // not vacuous: there is a page to check
    for (const text of UNKNOWN) expect(markup, text).not.toContain(text);
  });
});

describe('/pdv while waiting for the delay (reserved space, nothing visible)', () => {
  const markup = html('wait');

  it('keeps the shell', () => {
    expect(markup).toContain('pdv-app');
    expect(markup).toContain('Meu Comércio');
    expect(markup).toMatch(/<a[^>]*href="\/gestao"[^>]*>Gestão<\/a>/);
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
    expect(markup).toContain('aria-label="Venda atual"');
  });

  it('has no role="status", no loading text and no visible skeleton', () => {
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('aria-busy');
    expect(markup).not.toContain('sr-only');
    expect(markup).not.toContain('Carregando');
    // One hidden root per piece: main, side and status.
    expect(count(markup, /visibility:\s*hidden/g)).toBeGreaterThanOrEqual(3);
    expect(markup.indexOf('class="skeleton')).toBeGreaterThan(markup.search(/visibility:\s*hidden/));
  });

  it('has no data the server cannot know', () => {
    expect(markup).toContain('Meu Comércio'); // not vacuous: there is a page to check
    for (const text of UNKNOWN) expect(markup, text).not.toContain(text);
  });
});

describe('/pdv loading failures and requests (locked as at HEAD, baseline.md)', () => {
  it('still redirects to /login in exactly 2 places', () => {
    expect(count(source, "router.push('/login')")).toBe(2);
  });

  // HEAD has 12 (baseline.md). Step 6 adds exactly one on purpose: retryCustomers (apiClient.listCustomers,
  // only on click). Nothing else in the PDV gets a new call.
  it('has 13 apiClient calls: the 12 of HEAD plus the single retry of the customer list', () => {
    expect(count(source, 'apiClient.')).toBe(13);
    expect(count(source, 'apiClient.listCustomers(')).toBe(2);
    expect(count(source, 'apiClient.me()')).toBe(1);
    expect(count(source, 'apiClient.getCurrentCash()')).toBe(2);
    expect(count(source, 'apiClient.getStoreSettings()')).toBe(1);
  });

  it('keeps the first load as 4 parallel requests; only the listCustomers catch records the failure', () => {
    expect(source).toMatch(
      /Promise\.all\(\[\s*apiClient\.me\(\),\s*apiClient\.getCurrentCash\(\),\s*apiClient\.listCustomers\(\)\.catch\(\(\) => \{\s*setCustomersFailed\(true\);\s*return \{ items: \[\] \};\s*\}\),\s*(\/\/[^\n]*\n\s*)?apiClient\.getStoreSettings\(\)\.catch\(\(\) => \(\{ stockControlEnabled: true \}\)\),\s*\]\)/,
    );
    expect(source).toMatch(/\} catch \{\s*router\.push\('\/login'\);\s*\} finally \{\s*setLoading\(false\);/);
  });
});

describe('/pdv customer list failure notice (step 6, source)', () => {
  it('uses LoadFailureNotice from ui/load-failure-notice, once, and only for the customer list', () => {
    expect(source).toContain("from '@/frontend/ui/load-failure-notice'");
    expect(count(source, '<LoadFailureNotice')).toBe(1);
    expect(source).toMatch(/<LoadFailureNotice[^>]*what="a lista de clientes"/);
    expect(source).toMatch(/<LoadFailureNotice[^>]*onRetry=\{retryCustomers\}/);
  });

  it('puts the notice inside the fiado block, before the customer select, shown only on failure', () => {
    const start = source.search(/\{paymentMethod === 'TAB' && \(\s*<div className="pdv-field">/);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('<select', start);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toMatch(/customersFailed && \(?\s*<LoadFailureNotice/);
  });

  it('retryCustomers reads the list again, fills it, clears the mark on success and runs only from the click', () => {
    const start = source.search(/(async function retryCustomers|const retryCustomers\s*=)/);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, start + 700);
    expect(body).toContain('apiClient.listCustomers()');
    expect(body).toContain('setCustomers(');
    expect(body).toContain('setCustomersFailed(false)');
    expect(body).toMatch(/catch/);
    // Defined once and used once (the onRetry): not called from an effect or anywhere automatic.
    expect(count(source, 'retryCustomers')).toBe(2);
  });

  it('retryCustomers ignores a click while a retry runs, and the notice is busy meanwhile', () => {
    expect(source).toMatch(/<LoadFailureNotice[^>]*busy=\{retryingCustomers\}/);
    const start = source.search(/async function retryCustomers/);
    const body = source.slice(start, start + 700);
    expect(body).toMatch(/if \(retryingCustomers\) return;\s*setRetryingCustomers\(true\)/);
    expect(body).toMatch(/finally \{\s*setRetryingCustomers\(false\)/);
  });

  it('has no notice and no failure text in the server HTML of the first visit', () => {
    for (const override of [null, 'wait'] as const) {
      const markup = html(override);
      expect(markup).not.toContain('Tentar de novo');
      expect(markup).not.toContain('Não foi possível');
      expect(markup).not.toContain('role="alert"');
    }
  });
});
