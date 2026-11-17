import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same gate as `npm audit --audit-level=high`, except for the advisories listed here.
// Every entry needs a reason and an expiry date: after it, the advisory blocks again.
export const IGNORED_ADVISORIES = [
  {
    source: 1247710,
    ghsa: 'GHSA-fc5q-39xc-vjpf',
    // picomatch ReDoS (all versions, no patched release on 2026-11-17). Only build and test tools reach it
    // (vite, vitest, eslint, the Sentry build loader); no deployed route loads the npm package and no input
    // from a user reaches a glob. Remove this entry when a fixed picomatch is published (backlog 21.6).
    expires: '2026-12-17',
  },
];

const BLOCKING = new Set(['high', 'critical']);

/** The distinct high or critical advisories of an `npm audit --json` report that are not ignored today. */
export function findBlockingAdvisories(report, ignored = IGNORED_ADVISORIES, today = new Date().toISOString().slice(0, 10)) {
  const active = new Set(ignored.filter((entry) => today <= entry.expires).map((entry) => entry.source));
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === 'string' || !BLOCKING.has(via.severity) || active.has(via.source)) continue;
      found.set(via.source, via);
    }
  }
  return [...found.values()];
}

function main() {
  let output;
  try {
    output = execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (error) {
    output = error.stdout; // npm audit exits with 1 when it finds something
  }
  const blocking = findBlockingAdvisories(JSON.parse(output));
  if (blocking.length > 0) {
    console.error('Dependency audit: high or critical advisories not on the exception list:');
    for (const via of blocking) console.error(`  [${via.severity}] ${via.name}: ${via.title} (${via.url ?? via.source})`);
    process.exit(1);
  }
  console.log('OK: no high or critical advisory outside the exception list.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
