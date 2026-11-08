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

  it('opens a panel from the three dots, with Fiado as its only item', () => {
    expect(source).toContain('const [showMoreMethods, setShowMoreMethods] = useState(false)');
    expect(source).toContain('aria-expanded={showMoreMethods}');
    expect(source).toContain('aria-controls="pdv-more-methods"');
    // A plain disclosure: no ARIA menu role, because there is no arrow-key menu behavior.
    expect(source).not.toContain('aria-haspopup');
    expect(source).not.toContain('role="menu"');
    expect(source).not.toContain('role="menuitem"');
    // An icon-only button needs a label for screen readers.
    expect(source).toMatch(/className="pdv-dots"\s+aria-label="Mais opções de pagamento"/);
    expect(source.match(/<circle /g)?.length).toBe(3);
    // The panel only exists once opened, and its button starts the fiado payment.
    expect(source).toMatch(/\{showMoreMethods && \(\s*<div id="pdv-more-methods" className="pdv-menu-list">/);
    expect(source).toMatch(/id="pdv-more-methods"[\s\S]*?startPayment\('TAB'\)[\s\S]*?>\s*Fiado\s*</);
    expect(source).not.toContain('Vender no fiado');
  });

  it('closes the panel on an outside click and on Escape, without clearing the sale', () => {
    expect(source).toContain("closest('.pdv-menu')");
    // Escape is caught first, in the capture phase, and stopped by createEscapeDismiss (tested on its
    // own), so the global shortcut that clears the sale does not run. The focus goes back to the dots.
    expect(source).toMatch(/addEventListener\('keydown', handleEscape, true\)/);
    expect(source).toContain('createEscapeDismiss(');
    expect(source).toContain('dotsButtonRef.current?.focus()');
    expect(source).toContain('ref={dotsButtonRef}');
  });

  it('lets Enter confirm the sale only from the received amount field', () => {
    expect(source).toMatch(/onKeyDown=\{\(e\) => \{[\s\S]*?blocksImplicitSubmit\(e\.key, e\.target as HTMLElement\)\) e\.preventDefault\(\)/);
    expect(source).toContain('id="cash-received"');
  });

  it('shows the Fiado choice in the modal only once it was picked', () => {
    expect(source).toMatch(/paymentMethod === 'TAB' \? \[tabMethod\] : \[\]/);
  });

  it('opens the panel to the side of the dots, on the title row, with a 44 px touch area', () => {
    expect(css).toMatch(/\.pdv-menu\s*\{[^}]*position:\s*relative/);
    // To the left of the dots and vertically centered on them, never below them.
    expect(css).toMatch(/\.pdv-menu-list\s*\{[^}]*top:\s*50%/);
    expect(css).toMatch(/\.pdv-menu-list\s*\{[^}]*right:\s*calc\(100% \+ 8px\)/);
    expect(css).toMatch(/\.pdv-menu-list\s*\{[^}]*translateY\(-50%\)/);
    expect(css).not.toMatch(/\.pdv-menu-list\s*\{[^}]*top:\s*calc\(100%/);
    expect(css).toMatch(/\.pdv-menu-item\s*\{[^}]*min-height:\s*36px/);
    expect(css).toMatch(/\.pdv-menu-item::after\s*\{[^}]*inset:\s*-4px/);
    expect(css).toMatch(/\.pdv-dots\s*\{[^}]*width:\s*32px/);
    expect(css).toMatch(/\.pdv-dots::after\s*\{[^}]*inset:\s*-6px/);
    expect(css).toMatch(/\.pdv-menu-item:disabled\s*\{[^}]*color:\s*var\(--muted\)/);
  });
});
