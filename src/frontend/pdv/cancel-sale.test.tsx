import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CancelSaleModal } from './cancel-sale-modal';
import { formatSaleTime, isOwnerPin, isReasonValid } from './cancel-sale';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('the rules of the window', () => {
  it('asks for a PIN of exactly six digits', () => {
    expect(isOwnerPin('123456')).toBe(true);
    expect(isOwnerPin(' 123456 ')).toBe(true);
    expect(['12345', '1234567', 'abcdef', '12 456', ''].map(isOwnerPin)).toEqual([false, false, false, false, false]);
  });

  it('asks for a reason of at least three characters', () => {
    expect(isReasonValid('erro no registro')).toBe(true);
    expect(isReasonValid('abc')).toBe(true);
    expect(isReasonValid('  ab ')).toBe(false);
    expect(isReasonValid('')).toBe(false);
  });

  it('shows the time of a sale on the wall clock of Brasília', () => {
    expect(formatSaleTime('2026-11-10T01:05:00Z')).toBe('22:05');
    expect(formatSaleTime('2026-11-09T15:00:00Z')).toBe('12:00');
  });
});

describe('CancelSaleModal', () => {
  const markup = renderToStaticMarkup(<CancelSaleModal onClose={() => {}} onCancelled={() => {}} />);

  it('is a dialog that says it cancels a finished sale, and what happens to the stock and the money', () => {
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Cancelar venda finalizada');
    expect(markup).toContain('voltam ao estoque');
    expect(markup).toContain('PIN da proprietária');
  });

  it('lets the person pick the sale from a list instead of typing its id', () => {
    expect(markup).toContain('Vendas de hoje');
    expect(markup).not.toMatch(/UUID|550e8400-e29b/);
  });

  it('cannot confirm before a sale, the PIN and a reason are given', () => {
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Confirmar cancelamento<\/button>/);
  });
});

describe('where the button is', () => {
  const pdv = read('src', 'app', 'pdv', 'page.tsx');
  const gestao = read('src', 'app', 'gestao', 'page.tsx');

  it('is on the sales screen, with the other counter operations, and needs an open cash register', () => {
    expect(pdv).toContain('Cancelar venda finalizada');
    expect(pdv).toMatch(/disabled=\{!cashOpen \|\| !isOnline\}\s*onClick=\{\(\) => setIsCancelSaleOpen\(true\)\}/);
    expect(pdv).toContain('<CancelSaleModal');
  });

  it('is no longer in the management panel', () => {
    expect(gestao).not.toContain('Cancelar Venda');
    expect(gestao).not.toContain('cancelSale');
    expect(gestao).not.toContain('CancelSale');
  });

  it('does not let Esc clear the sale being rung up while the window is open', () => {
    expect(pdv).toContain('if (weightProduct || isCancelSaleOpen) return;');
    expect(read('src', 'frontend', 'pdv', 'cancel-sale-modal.tsx')).toContain('createEscapeDismiss(onClose)');
  });

  it('keeps the button that clears the sale being rung up, which is another thing', () => {
    expect(pdv).toContain('Cancelar venda · Esc');
  });
});

describe('the recent sales API', () => {
  const route = read('src', 'app', 'api', 'sales', 'recent', 'route.ts');

  it('needs a signed in person, reads only the shop of the session and is never cached', () => {
    expect(route).toContain('requireAuthenticatedSession()');
    expect(route).toContain('session.merchantId');
    expect(route).toContain("'Cache-Control': 'no-store'");
    expect(route).toContain('await connection();');
  });
});
