import { fileURLToPath } from 'node:url';

const SHORT_COMMIT_LENGTH = 7;
const REQUEST_TIMEOUT_MS = 15_000;

async function checkOnce({ baseUrl, expectedCommit, fetchFn }) {
  const problems = [];
  const expected = expectedCommit.slice(0, SHORT_COMMIT_LENGTH);
  const get = (path) => fetchFn(new URL(path, baseUrl), { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  try {
    const login = await get('/login');
    if (login.status !== 200) problems.push(`/login answered ${login.status} instead of 200`);
  } catch (error) {
    problems.push(`/login could not be read: ${error.message}`);
  }

  try {
    const version = await get('/api/version');
    if (version.status !== 200) {
      problems.push(`/api/version answered ${version.status} instead of 200`);
    } else {
      const info = await version.json();
      if (info.commit !== expected) {
        problems.push(`/api/version shows commit ${info.commit || '(empty)'} but ${expected} was deployed`);
      }
    }
  } catch (error) {
    problems.push(`/api/version could not be read: ${error.message}`);
  }

  return problems;
}

/**
 * Checks that the site that was just deployed is up and is the version that went out: /login answers 200
 * and /api/version shows the deployed commit. It only reads two public pages (GET), never touches data or money.
 * The new version can take a few seconds to take over, so it tries again before giving up.
 */
export async function runSmokeCheck({
  baseUrl,
  expectedCommit,
  fetchFn = fetch,
  attempts = 12,
  delayMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    problems = await checkOnce({ baseUrl, expectedCommit, fetchFn });
    if (problems.length === 0) return { ok: true, problems: [] };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ok: false, problems };
}

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL;
  const expectedCommit = process.env.GITHUB_SHA;
  if (!baseUrl || !expectedCommit) {
    console.error('SMOKE_BASE_URL and GITHUB_SHA must be set.');
    process.exit(1);
  }

  const result = await runSmokeCheck({ baseUrl, expectedCommit });
  if (!result.ok) {
    console.error(`Smoke test failed for ${baseUrl}:`);
    for (const problem of result.problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`Smoke test passed: ${baseUrl} is up and runs commit ${expectedCommit.slice(0, SHORT_COMMIT_LENGTH)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
