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
    // The longer timeouts (30 s) keep a slow CI runner from failing a test that only needs a few seconds more.
    expect(pkg.scripts['test:integration']).toBe(
      'vitest run integration --no-file-parallelism --testTimeout=30000 --hookTimeout=30000'
    );
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

describe('the smoke test after the production deploy (21.3)', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  const deploy = ci.slice(ci.indexOf('  deploy:'));

  it('runs after the deploy step, in the deploy job, so a red check means the new version is not working', () => {
    const deployStep = deploy.indexOf('run: vercel --prod --yes');
    const smokeStep = deploy.indexOf('run: node scripts/smoke-check.mjs');

    expect(deployStep).toBeGreaterThan(-1);
    expect(smokeStep).toBeGreaterThan(deployStep);
  });

  it('checks the public site and the commit that was just deployed, and uses no secret', () => {
    const smoke = deploy.slice(deploy.indexOf('Smoke test'));

    expect(smoke).toContain('SMOKE_BASE_URL: https://meucomercio.vercel.app');
    expect(smoke).not.toContain('secrets.');
  });
});
