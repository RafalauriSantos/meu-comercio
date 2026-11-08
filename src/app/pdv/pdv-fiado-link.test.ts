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

  it('keeps fiado behind a closed three-dots button in the payment card', () => {
    expect(source).toContain('const [showMoreMethods, setShowMoreMethods] = useState(false)');
    expect(source).toContain('aria-expanded={showMoreMethods}');
    expect(source).toContain('aria-controls="pdv-more-methods"');
    // An icon-only button needs a label for screen readers.
    expect(source).toMatch(/className="pdv-dots"\s+aria-label="Mais opções de pagamento"/);
    expect(source.match(/<circle /g)?.length).toBe(3);
    // The fiado button only exists once the disclosure is open, and it starts the fiado payment.
    expect(source).toMatch(/\{showMoreMethods && \([\s\S]*?startPayment\('TAB'\)[\s\S]*?Vender no fiado/);
    expect(source.match(/>\s*Vender no fiado\s*</g)?.length).toBe(1);
  });

  it('shows the Fiado choice in the modal only once it was picked', () => {
    expect(source).toMatch(/paymentMethod === 'TAB' \? \[tabMethod\] : \[\]/);
  });

  it('draws both links like small text, with a touch area taller than the line', () => {
    expect(css).toMatch(/\.pdv-dots\s*\{[^}]*width:\s*32px/);
    expect(css).toMatch(/\.pdv-dots::after\s*\{[^}]*inset:\s*-6px/);
    expect(css).toMatch(/\.pdv-fiado-link\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/\.pdv-fiado-link::after\s*\{[^}]*inset:\s*-14px/);
    expect(css).toMatch(/\.pdv-fiado-link:disabled\s*\{[^}]*color:\s*var\(--muted\)/);
  });
});
