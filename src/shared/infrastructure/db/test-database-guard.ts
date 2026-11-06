// Integration tests migrate and insert rows, so they must never reach a real database.
// Accept only a plain local Postgres URL: no query, no fragment, no whitespace,
// and a single database name matching [a-z0-9_]+_test.
const REFUSAL =
  'TEST_DATABASE_URL must be a plain local Postgres URL (no query, fragment or whitespace) with a database name of the form [a-z0-9_]+_test.';

export function assertDisposableTestDatabase(url: string): void {
  if (/[\s?#]/.test(url)) {
    throw new Error(REFUSAL);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(REFUSAL);
  }

  const isPostgres = parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const databaseName = parsed.pathname.replace(/^\//, '');
  const isSingleTestName = /^[a-z0-9_]+_test$/.test(databaseName);

  if (!isPostgres || !isLocal || !isSingleTestName) {
    throw new Error(REFUSAL);
  }
}
