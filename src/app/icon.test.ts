import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = join(process.cwd(), 'src', 'app');

describe('app icon', () => {
  it('is the brand mark of the design: a blue tile with a white receipt and a check', () => {
    const svg = readFileSync(join(app, 'icon.svg'), 'utf8');
    const brandMark = readFileSync(join(process.cwd(), 'src', 'frontend', 'ui', 'brand-mark.tsx'), 'utf8');

    expect(svg).toContain('viewBox="0 0 40 40"');
    expect(svg).toContain('fill="#2457c5"');
    // Same shapes as the BrandMark in the header.
    for (const d of ['M12 8h16v24l-2.7-2-2.6 2-2.7-2-2.7 2-2.7-2-2.6 2z', 'M16.5 19.5l2.8 2.8 5.2-5.6']) {
      expect(svg).toContain(d);
      expect(brandMark).toContain(d);
    }
  });

  it('replaces the default Next.js favicon', () => {
    expect(existsSync(join(app, 'favicon.ico'))).toBe(false);
  });
});
