// Runs the same checks as .github/workflows/ci.yml, in the same order, without the
// autofix commit, the deploy, or the GitHub-only steps. Stops at the first failure.
// Set TEST_DATABASE_URL to also run the Postgres integration test (CI job "integration").
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'Lint', cmd: 'npm run lint' },
  { name: 'TypeScript', cmd: 'npx tsc --noEmit' },
  { name: 'Unit and integration tests', cmd: 'npm test' },
  { name: 'Dependency audit (high)', cmd: 'npm audit --audit-level=high' },
  ...(process.env.TEST_DATABASE_URL
    ? [{ name: 'Postgres integration', cmd: 'npx vitest run src/modules/customers/infrastructure/drizzle-owner-pin-attempt-store.integration.test.ts' }]
    : [{ name: 'Postgres integration (skipped: TEST_DATABASE_URL not set)', cmd: null }]),
  { name: 'Production build (without DATABASE_URL)', cmd: 'npm run build:safe' },
];

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
const results = [];

for (const step of steps) {
  if (!step.cmd) {
    results.push({ name: step.name, status: 'SKIP' });
    continue;
  }
  console.log(`\n=== ${step.name}: ${step.cmd}`);
  const started = Date.now();
  const run = spawnSync(step.cmd, { stdio: 'inherit', shell: true, env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = run.status === 0;
  results.push({ name: step.name, status: ok ? 'OK' : 'FAIL', seconds });
  if (!ok) break;
}

console.log('\n=== Summary');
for (const r of results) {
  console.log(`${r.status.padEnd(5)} ${r.name}${r.seconds ? ` (${r.seconds}s)` : ''}`);
}
const failed = results.some((r) => r.status === 'FAIL');
process.exit(failed ? 1 : 0);
