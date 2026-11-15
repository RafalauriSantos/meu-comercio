import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readScreenFiles, readScreenSource } from './read-screen-source';

describe('readScreenSource on the real repository', () => {
  it('reads the page and the non-test files of the area folder, page first', () => {
    const files = readScreenFiles('gestao').map((f) => f.file);

    expect(files[0]).toBe('src/app/gestao/page.tsx');
    expect(files).toContain('src/frontend/management/import-products-panel.tsx');
    expect(files).toContain('src/frontend/management/sales-report-panel.tsx');
    expect(files.some((f) => /\.test\./.test(f))).toBe(false);
    expect(readScreenFiles('pdv').map((f) => f.file)).toEqual(
      expect.arrayContaining(['src/app/pdv/page.tsx', 'src/frontend/pdv/cancel-sale-modal.tsx']),
    );
  });

  it('has the text of the page and of the other files, and no text of a test', () => {
    const gestao = readScreenSource('gestao');

    expect(gestao).toContain('export default function GestaoPage');
    expect(gestao).toContain('export function ImportProductsPanel');
    expect(gestao).not.toContain("describe('");
    expect(readScreenSource('pdv')).toContain('export function CancelSaleModal');
  });
});

describe('readScreenSource fails loud', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  // A small repository with a Gestão screen; `skip` leaves one thing out.
  function fakeRepo(skip?: 'page' | 'folder' | 'expected' | 'empty-page'): string {
    const root = mkdtempSync(join(tmpdir(), 'screen-'));
    roots.push(root);
    const page = join(root, 'src', 'app', 'gestao');
    const folder = join(root, 'src', 'frontend', 'management');
    mkdirSync(page, { recursive: true });
    if (skip !== 'folder') mkdirSync(folder, { recursive: true });
    if (skip !== 'page') writeFileSync(join(page, 'page.tsx'), skip === 'empty-page' ? '  \n' : 'export default function P() {}');
    if (skip !== 'folder') {
      const names = ['customers-tab.tsx', 'import-products-panel.tsx', 'management-skeleton.tsx', 'operators-tab.tsx', 'products-tab.tsx', 'sales-report-panel.tsx', 'use-customers-tab.ts', 'use-operators-tab.ts', 'use-products-tab.ts'];
      for (const name of names.filter((n) => skip !== 'expected' || n !== 'sales-report-panel.tsx')) {
        writeFileSync(join(folder, name), `export const ${name.replace(/\W/g, '_')} = 1;`);
      }
      writeFileSync(join(folder, 'ignored.test.ts'), 'describe()');
    }
    return root;
  }

  it('reads a complete screen', () => {
    const files = readScreenFiles('gestao', fakeRepo());

    expect(files.map((f) => f.file)).toEqual([
      'src/app/gestao/page.tsx',
      'src/frontend/management/customers-tab.tsx',
      'src/frontend/management/import-products-panel.tsx',
      'src/frontend/management/management-skeleton.tsx',
      'src/frontend/management/operators-tab.tsx',
      'src/frontend/management/products-tab.tsx',
      'src/frontend/management/sales-report-panel.tsx',
      'src/frontend/management/use-customers-tab.ts',
      'src/frontend/management/use-operators-tab.ts',
      'src/frontend/management/use-products-tab.ts',
    ]);
  });

  it('gives the same relative names when the root ends with a slash', () => {
    const root = fakeRepo();

    expect(readScreenFiles('gestao', `${root}/`).map((f) => f.file)).toEqual(readScreenFiles('gestao', root).map((f) => f.file));
    expect(readScreenFiles('gestao', `${root}/`)[0].file).toBe('src/app/gestao/page.tsx');
  });

  it('throws when the page does not exist', () => {
    expect(() => readScreenSource('gestao', fakeRepo('page'))).toThrow(/page .*does not exist/);
  });

  it('throws when the folder does not exist', () => {
    expect(() => readScreenSource('gestao', fakeRepo('folder'))).toThrow(/folder .*does not exist/);
  });

  it('throws when an expected file of the folder is missing', () => {
    expect(() => readScreenSource('gestao', fakeRepo('expected'))).toThrow(/sales-report-panel\.tsx was not found/);
  });

  it('throws when the page is empty', () => {
    expect(() => readScreenSource('gestao', fakeRepo('empty-page'))).toThrow(/page is empty/);
  });

  it('throws for an unknown screen', () => {
    expect(() => readScreenSource('login' as never)).toThrow(/Unknown screen/);
  });
});
