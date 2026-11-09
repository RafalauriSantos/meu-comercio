import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

function integrationTests(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) integrationTests(path, found);
    else if (name.endsWith('.integration.test.ts')) found.push(path);
  }
  return found;
}

describe('the Postgres integration tests in the CI', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('the script runs every file with "integration" in its name, one file at a time', () => {
    // Every file migrates the same database: two at once would race to create the same tables.
    expect(pkg.scripts['test:integration']).toBe('vitest run integration --no-file-parallelism');
  });

  it('the CI job and the local gate use that script, not a list of files', () => {
    expect(read('.github', 'workflows', 'ci.yml')).toContain('run: npm run test:integration');
    expect(read('.github', 'workflows', 'ci.yml')).not.toMatch(/npx vitest run src\/.*integration\.test\.ts/);
    expect(read('scripts', 'ci-local.mjs')).toContain("cmd: 'npm run test:integration'");
  });

  it('every integration test file is named so that the filter finds it, and refuses a database that is not disposable', () => {
    const files = integrationTests(join(root, 'src'));

    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).toContain('assertDisposableTestDatabase');
      expect(text, file).toContain('describe.skipIf(!TEST_DATABASE_URL)');
    }
  });
});
