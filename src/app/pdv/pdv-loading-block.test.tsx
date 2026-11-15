import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readScreenSource } from '@/test-utils/read-screen-source';

// While the first load is pending, nothing in the PDV can start a sale, a payment or a cash movement:
// there is no control to click or type in, and the global shortcuts need a non-empty cart.
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

// The whole screen: the page plus the files of src/frontend/pdv.
const source = readScreenSource('pdv');

function html(override: typeof gate.override): string {
  gate.override = override;
  return renderToStaticMarkup(<PdvPage />);
}

describe.each([
  ['first visit (skeleton)', null],
  ['waiting for the delay', 'wait'],
] as const)('/pdv while loading, %s', (_name, override) => {
  const markup = html(override);

  it('has no input, select, textarea or dialog', () => {
    for (const tag of ['<input', '<select', '<textarea', '<dialog', 'role="dialog"']) expect(markup).not.toContain(tag);
  });

  it('has no button other than Sair', () => {
    const buttons = [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    expect(buttons).toEqual(['Sair']);
  });

  it('has no payment, cash movement, finish or cancel control', () => {
    for (const text of ['Finalizar', 'Receber', 'Sangria', 'Suprimento', 'Cancelar', 'Dinheiro', 'Pix', 'Débito', 'Crédito', 'Fiado', 'Limpar', 'Adicionar']) {
      expect(markup, text).not.toContain(text);
    }
  });
});

describe('/pdv shortcuts need a cart', () => {
  it('opens the checkout with F4 only when the cart has items, and the cart starts empty', () => {
    expect(source).toMatch(/e\.key === 'F4'[\s\S]{0,120}cart\.length > 0 && !isCheckoutOpen/);
    expect(source).toMatch(/useState<[^>]*>\(\[\]\)|const \[cart, setCart\] = useState/);
  });
});
