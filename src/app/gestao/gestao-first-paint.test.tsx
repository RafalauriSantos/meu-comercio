import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readScreenSource } from '@/test-utils/read-screen-source';

// The server HTML of /gestao is what renderToStaticMarkup gives: effects do not run, so the page is in its
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

import GestaoPage from './page';

// The whole screen: the page plus the files of src/frontend/management.
const source = readScreenSource('gestao');

function count(text: string, needle: string | RegExp): number {
  return typeof needle === 'string' ? text.split(needle).length - 1 : (text.match(needle) ?? []).length;
}

function html(override: typeof gate.override): string {
  gate.override = override;
  return renderToStaticMarkup(<GestaoPage />);
}

// Text that depends on data or on the user, and so cannot be in the HTML the server sends.
const UNKNOWN = ['· Dona', '· Operador', 'Dona', 'Operador', 'Relatórios', 'Operadores', 'Caixa fechado', 'Fechado', 'Aberto', 'R$', '(0)'];

describe('/gestao first paint (server HTML, first visit)', () => {
  const markup = html(null);

  it('has the real shell: brand, links, current page, Sair, title and subtitle', () => {
    expect(markup).toContain('Meu Comércio');
    expect(markup).toMatch(/<a[^>]*href="\/pdv"[^>]*>Venda<\/a>/);
    expect(markup).toMatch(/<a[^>]*href="\/gestao"[^>]*>Gestão<\/a>/);
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>Gestão<\/a>/);
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
    expect(markup).toMatch(/<h1>Painel de Gestão do Comércio<\/h1>/);
    expect(markup).toContain('Retaguarda &amp; Controle');
    expect(markup).toContain('management-page');
  });

  it('has the skeleton shape in the data area, announced once', () => {
    expect(markup).toContain('class="skeleton');
    expect(count(markup, 'role="status"')).toBe(1);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Carregando o painel de gestão');
  });

  it('has no gray block in place of the header or the title', () => {
    expect(markup).not.toContain('app-header-skeleton');
    expect(markup).not.toContain('app-nav-skeleton');
    expect(markup).not.toMatch(/mg-titlebar[^>]*aria-hidden/); // the real title keeps its wrapper
  });

  it('has no data the server cannot know', () => {
    expect(markup).toContain('Meu Comércio'); // not vacuous: there is a page to check
    for (const text of UNKNOWN) expect(markup, text).not.toContain(text);
  });
});

describe('/gestao while waiting for the delay (reserved space, nothing visible)', () => {
  const markup = html('wait');

  it('keeps the shell', () => {
    expect(markup).toContain('Meu Comércio');
    expect(markup).toMatch(/<a[^>]*href="\/gestao"[^>]*>Gestão<\/a>/);
    expect(markup).toMatch(/<button[^>]*>Sair<\/button>/);
    expect(markup).toMatch(/<h1>Painel de Gestão do Comércio<\/h1>/);
  });

  it('has no role="status", no loading text and no visible skeleton', () => {
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('aria-busy');
    expect(markup).not.toContain('sr-only');
    expect(markup).not.toContain('Carregando');
    expect(markup).toMatch(/visibility:\s*hidden/);
    // Every gray block sits after the hidden root.
    const firstBlock = markup.indexOf('class="skeleton');
    expect(firstBlock).toBeGreaterThan(markup.search(/visibility:\s*hidden/));
  });

  it('has no data the server cannot know', () => {
    expect(markup).toContain('Meu Comércio'); // not vacuous: there is a page to check
    for (const text of UNKNOWN) expect(markup, text).not.toContain(text);
  });
});

describe('/gestao loading failures and requests (locked as at HEAD, baseline.md)', () => {
  it('still redirects to /login in exactly 2 places', () => {
    expect(count(source, "router.push('/login')") + count(source, 'router.push(loginUrlHere())')).toBe(2);
  });

  // HEAD has 19 (baseline.md). Step 5 adds exactly one on purpose: the retry of the missing balances
  // (apiClient.getCustomerBalance inside the retry). Every other retry reuses the existing loadX functions.
  // Counted over the whole screen: the 20 of page.tsx plus the 2 of import-products-panel.tsx, which is its
  // own file and does not move.
  it('has 21 apiClient calls: the 19 of HEAD plus the single retry of the missing balances, plus the barcode scan lookup, plus updateProduct and the barcode lookup of the product edit (and 2 in import-products-panel), plus updateCustomer of the customer edit, plus updateProduct of Gerar código', () => {
    expect(count(source, 'apiClient.')).toBe(21 + 2 + 2 + 2 + 1 + 1);
    expect(count(source, 'apiClient.getCustomerBalance(')).toBe(2);
    expect(count(source, 'apiClient.listCustomers(')).toBe(1);
    expect(count(source, 'apiClient.listProducts(')).toBe(2);
    expect(count(source, 'apiClient.getCurrentCash(')).toBe(1);
    expect(count(source, 'apiClient.getCreditMetrics(')).toBe(1);
    expect(count(source, 'apiClient.listOperators(')).toBe(1);
  });

  it('keeps the first load: me() first, only an expired session goes to /login, any other failure is an in-screen error, and then loading ends', () => {
    expect(count(source, 'apiClient.me()')).toBe(1);
    expect(source).toMatch(
      /\} catch \(err\) \{\s*if \(shouldGoToLogin\(err\)\) router\.push\(loginUrlHere\(\)\);\s*else setInitError\(loadErrorMessage\(err\)\);\s*\} finally \{\s*setLoading\(false\);/
    );
  });
});

// Source locks for step 5 (A2): the failure state is recorded where the loaders swallow the error today,
// the order and the number of the first-load requests do not change, and nothing new runs by itself.
function loaderBody(name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start, name).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}, []);', start));
}

describe('/gestao failure notice (step 5, source)', () => {
  it('uses LoadFailureNotice from ui/load-failure-notice', () => {
    expect(source).toContain("from '@/frontend/ui/load-failure-notice'");
    expect(count(source, '<LoadFailureNotice')).toBeGreaterThanOrEqual(5);
  });

  it.each(['loadProducts', 'loadCustomers', 'loadCash', 'loadCreditMetrics', 'loadOperators'])(
    '%s marks the failure in the catch and keeps its console.error',
    (name) => {
      const body = loaderBody(name);
      expect(body).toMatch(/catch \(err\) \{[\s\S]*console\.error\(/);
      expect(body).toMatch(/catch \(err\) \{[\s\S]*setLoadFailed\(/);
    },
  );

  it('keeps the first-load requests in the same order and the effect dependencies unchanged but for the retry counter (no new automatic run)', () => {
    expect(source).toMatch(/loadProducts\(\),\s*loadCustomers\(\),\s*loadCash\(\),\s*loadCreditMetrics\(\),\s*\];/);
    expect(source).toMatch(/tasks\.push\(loadOperators\(\)\)/);
    // `attempt` only changes on the click of Tentar de novo (retryInit), so there is still no new automatic run.
    expect(source).toContain('}, [router, loadProducts, loadCustomers, loadCash, loadCreditMetrics, loadOperators, attempt]);');
  });

  it('has no notice and no failure text in the server HTML of the first visit (failures only exist after the load)', () => {
    for (const override of [null, 'wait'] as const) {
      const markup = html(override);
      expect(markup).not.toContain('Tentar de novo');
      expect(markup).not.toContain('Não foi possível');
      expect(markup).not.toContain('role="alert"');
    }
  });
});

describe('/gestao first load retry (source)', () => {
  it('attempt only changes in retryInit, which is only wired to the Tentar de novo of the failed first load', () => {
    expect(count(source, 'setAttempt(')).toBe(1);
    expect(count(source, 'retryInit')).toBe(2); // the definition and the onRetry
    expect(source).toMatch(/<LoadFailureNotice what="o painel" reason=\{initError\} onRetry=\{retryInit\}/);
  });
});
