// Temporary route to check Sentry in production. Removed right after the check.
import { connection } from "next/server";

export async function GET() {
  await connection();
  throw new Error("Sentry smoke test (temporary route)");
}
