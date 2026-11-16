// Temporary route to check Sentry in production. Removed right after the check.
export function GET() {
  throw new Error("Sentry smoke test (temporary route)");
}
