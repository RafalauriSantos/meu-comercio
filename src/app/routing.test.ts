import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(process.cwd(), 'src', 'app');

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
    const offenders = ['pdv', 'gestao', 'login']
      .filter((folder) => existsSync(join(APP_DIR, folder)))
      .flatMap((folder) => sourceFilesUnder(join(APP_DIR, folder)))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return text.includes('href="/"') || text.includes("router.push('/')");
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
