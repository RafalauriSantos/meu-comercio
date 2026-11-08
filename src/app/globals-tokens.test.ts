import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

describe('theme tokens', () => {
  it('has only the light theme: the app never follows the dark mode of the system', () => {
    expect(css).not.toContain('prefers-color-scheme: dark');
    expect(css).not.toContain("[data-theme='dark']");
    expect(css).not.toMatch(/color-scheme:\s*dark/);
  });

  it('declares the light tokens on :root with color-scheme light', () => {
    const rule = css.match(/^:root,\n\[data-theme='light'\] \{([^}]*)\}/m)?.[1] ?? '';

    expect(rule).toMatch(/color-scheme:\s*light;/);
    for (const token of ['--bg', '--surface', '--text', '--primary', '--header', '--ink', '--input']) {
      expect(rule, `${token} is missing`).toContain(`${token}:`);
    }
  });
});
