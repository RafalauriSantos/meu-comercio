import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'app', 'pdv', 'page.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'pdv.css'), 'utf8');

describe('PDV: fiado is hidden from the main buttons but easy to find', () => {
  it('does not list fiado among the main payment buttons', () => {
    const block = source.match(/const mainMethods[\s\S]*?\];/)?.[0] ?? '';

    expect(block).toContain("'CASH'");
    expect(block).toContain("'CREDIT_CARD'");
    expect(block).not.toContain("'TAB'");
  });

  it('offers fiado through a "Vender no fiado" link in the payment card and in the payment modal', () => {
    // Count the buttons' text, not the comment that mentions the link.
    expect(source.match(/>\s*Vender no fiado\s*</g)?.length).toBe(2);
    expect(source).toContain("startPayment('TAB')");
    expect(source).toContain("selectMethod('TAB')");
  });

  it('shows the Fiado choice in the modal only once it was picked', () => {
    expect(source).toMatch(/paymentMethod === 'TAB' \? \[tabMethod\] : \[\]/);
  });

  it('draws the link like text with a touch area taller than the line, muted when disabled', () => {
    expect(css).toMatch(/\.pdv-fiado-link\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/\.pdv-fiado-link::after\s*\{[^}]*inset:\s*-14px/);
    expect(css).toMatch(/\.pdv-fiado-link:disabled\s*\{[^}]*color:\s*var\(--muted\)/);
  });
});
