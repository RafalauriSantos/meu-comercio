import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatVersionLabel } from './version';

const root = process.cwd();

describe('formatVersionLabel', () => {
  it('shows the version and, when the deploy knows it, the short commit', () => {
    expect(formatVersionLabel({ version: '0.1.0', commit: '8890df1', builtAt: '' })).toBe('v0.1.0 · 8890df1');
    expect(formatVersionLabel({ version: '0.1.0', commit: '', builtAt: '' })).toBe('v0.1.0');
  });
});

describe('the version of the app', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');

  it('is a Semantic Version', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it('is the latest released version written in the CHANGELOG, so the two never drift apart', () => {
    const latest = changelog.match(/^## \[(\d+\.\d+\.\d+[^\]]*)\] - \d{4}-\d{2}-\d{2}$/m);

    expect(latest?.[1]).toBe(pkg.version);
  });

  it('keeps an "unreleased" section at the top for what comes next', () => {
    const headings = [...changelog.matchAll(/^## \[(.+?)\]/gm)].map((m) => m[1]);

    expect(headings[0]).toBe('Não lançado');
  });

  it('is set at build time by next.config.ts from package.json', () => {
    const config = readFileSync(join(root, 'next.config.ts'), 'utf8');

    expect(config).toContain('NEXT_PUBLIC_APP_VERSION: version');
    expect(config).toContain('package.json');
  });
});
