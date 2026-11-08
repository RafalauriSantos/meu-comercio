import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'pdv.css'), 'utf8');

describe('PDV on a phone', () => {
  it('keeps the barcode field at 56px when the scan row becomes a column', () => {
    // flex: 1 in a column collapses the field to the height of its text (22px), so the phone rule
    // has to turn it off.
    expect(css).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.pdv-scan-input\s*\{[^}]*flex:\s*none[^}]*height:\s*56px/);
  });
});
