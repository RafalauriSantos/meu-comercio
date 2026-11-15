import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Test helper (never imported by the app). A screen is its page in src/app plus every non-test .ts/.tsx
// of its folder in src/frontend, so a test that reads "the screen" keeps working when code moves from the
// page to a file of the folder, and the same asserts keep the same meaning.
//
// It fails loud instead of returning less text: a missing page, a missing folder or a missing expected
// file throws, because a `not.toContain` that read nothing would pass without checking anything.

export type Screen = 'pdv' | 'gestao';

type ScreenConfig = {
  page: string[];
  folder: string[];
  // Files of the folder that exist today and must still exist. Add a file here only if it is not going
  // to be renamed or deleted; a rename has to be a conscious edit of this list.
  expected: string[];
};

const SCREENS: Record<Screen, ScreenConfig> = {
  pdv: {
    page: ['src', 'app', 'pdv', 'page.tsx'],
    folder: ['src', 'frontend', 'pdv'],
    expected: ['cancel-sale-modal.tsx', 'pdv-skeleton.tsx', 'receipt-modal.tsx', 'search-results.tsx', 'weight-prompt.tsx'],
  },
  gestao: {
    page: ['src', 'app', 'gestao', 'page.tsx'],
    folder: ['src', 'frontend', 'management'],
    expected: ['customers-tab.tsx', 'import-products-panel.tsx', 'management-skeleton.tsx', 'operators-tab.tsx', 'products-tab.tsx', 'sales-report-panel.tsx', 'use-customers-tab.ts', 'use-operators-tab.ts', 'use-products-tab.ts'],
  },
};

export type ScreenFile = { file: string; text: string };

function filesOfFolder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

// The page first, then the other files of the folder in name order. `file` is relative to `root`.
export function readScreenFiles(screen: Screen, root: string = process.cwd()): ScreenFile[] {
  const config = SCREENS[screen];
  if (!config) throw new Error(`Unknown screen "${String(screen)}"`);

  const page = join(root, ...config.page);
  if (!existsSync(page)) throw new Error(`Screen "${screen}": the page ${config.page.join('/')} does not exist`);

  const folder = join(root, ...config.folder);
  if (!existsSync(folder)) throw new Error(`Screen "${screen}": the folder ${config.folder.join('/')} does not exist`);

  const files = filesOfFolder(folder);
  for (const name of config.expected) {
    if (!files.includes(join(folder, name))) {
      throw new Error(`Screen "${screen}": expected file ${config.folder.join('/')}/${name} was not found`);
    }
  }

  const all = [page, ...files].map((path) => ({
    file: relative(root, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }));
  if (all[0].text.trim() === '') throw new Error(`Screen "${screen}": the page is empty`);
  return all;
}

// All the files of the screen as one text (raw: line endings are not changed).
export function readScreenSource(screen: Screen, root: string = process.cwd()): string {
  return readScreenFiles(screen, root)
    .map((f) => f.text)
    .join('\n');
}
