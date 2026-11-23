// Drizzle wraps driver errors: the SQL and its params are in the message, the driver error is in `cause`.
// A route that finds one answers a generic message and logs only the SQLSTATE, never the message (19.8).

export function driverCauseOf(error: unknown): object | null {
  if (!(error instanceof Error) || !('cause' in error)) return null;
  return typeof error.cause === 'object' && error.cause !== null ? error.cause : null;
}

export function sqlStateOf(error: unknown): string | null {
  const cause = driverCauseOf(error);
  if (cause !== null && 'code' in cause && typeof cause.code === 'string') {
    return cause.code;
  }
  return null;
}
