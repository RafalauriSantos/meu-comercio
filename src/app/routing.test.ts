import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(process.cwd(), 'src', 'app');
const FRONTEND_DIR = join(process.cwd(), 'src', 'frontend');
// The brand of the sign in card links to the landing page (/) on purpose; auth-shell.test.tsx locks it.
// The exception is narrow: this file must have exactly one `href="/"` and no `router.push('/')`. Any other
// link to / (in this file or in any other swept file) fails.
const AUTH_SHELL = join(FRONTEND_DIR, 'auth', 'auth-shell.tsx');
const allowedLandingLinks = (file: string) => (file === AUTH_SHELL ? 1 : 0);

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('routing: the PDV lives at /pdv', () => {
  it('serves the PDV from src/app/pdv/page.tsx', () => {
    expect(existsSync(join(APP_DIR, 'pdv', 'page.tsx'))).toBe(true);
  });

  it('has no link from the PDV, management or login screens back to / as if it were the PDV', () => {
    // The pages in src/app and the code of the same screens in src/frontend (it moves out of the pages).
    const folders = [
      ...['pdv', 'gestao', 'login'].map((folder) => join(APP_DIR, folder)),
      ...['pdv', 'management', 'auth'].map((folder) => join(FRONTEND_DIR, folder)),
    ];
    expect(folders.slice(3).filter((folder) => !existsSync(folder))).toEqual([]); // not vacuous: the frontend folders are there
    const offenders = folders
      .filter((folder) => existsSync(folder))
      .flatMap((folder) => sourceFilesUnder(folder))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        const links = text.split('href="/"').length - 1;
        return links !== allowedLandingLinks(file) || text.includes("router.push('/')");
      });

    expect(offenders).toEqual([]);
  });

  it('sends the user to /pdv after login and after opening the cash register', () => {
    const text = readFileSync(join(APP_DIR, 'login', 'page.tsx'), 'utf8');

    expect(text.split("router.push('/pdv')")).toHaveLength(3);
  });

  it('forwards an operator who already has a session and an open cash register to /pdv', () => {
    const text = readFileSync(join(APP_DIR, 'login', 'page.tsx'), 'utf8');

    expect(text).toContain("destinationForSession({ cashOpen: cash.open }) === 'pdv'");
    expect(text).toContain("router.replace('/pdv')");
  });
});
