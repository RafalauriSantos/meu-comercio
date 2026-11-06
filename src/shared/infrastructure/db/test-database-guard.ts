// Integration tests migrate and insert rows, so they must never reach a real database.
// Accept only a local Postgres URL with no query string, and a database name ending in _test.
export function assertDisposableTestDatabase(url: string): void {
  const refusal = 'TEST_DATABASE_URL must be a local Postgres URL with no query string, and a database name ending in _test.';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(refusal);
  }

  const isPostgres = parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const databaseName = parsed.pathname.replace(/^\//, '');
  const hasNoQuery = parsed.search === '' && parsed.hash === '';

  if (!isPostgres || !isLocal || !hasNoQuery || !databaseName.endsWith('_test')) {
    throw new Error(refusal);
  }
}
