import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Returns the API route handlers that `next build` prerendered. A prerendered handler runs
 * during the build (and queries the database when DATABASE_URL is set) and its answer stays
 * frozen until the next deploy. API handlers must read request-time data instead.
 */
export function findPrerenderedApiRoutes(manifest) {
  return Object.entries(manifest.routes ?? {})
    .filter(([path, entry]) => path.startsWith('/api/') && entry.routeType === 'route')
    .map(([path]) => path)
    .sort();
}

function main() {
  const manifestPath = process.argv[2] ?? '.next/prerender-manifest.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const offenders = findPrerenderedApiRoutes(manifest);

  if (offenders.length > 0) {
    console.error('API routes prerendered at build time (they must await connection() or read the request):');
    for (const path of offenders) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log('OK: no API route is prerendered at build time.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
