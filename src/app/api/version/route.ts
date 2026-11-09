import { NextResponse, connection } from 'next/server';
import { getVersionInfo } from '@/shared/version';

// Public on purpose: it holds no secret and tells anyone (or a monitor) which version is running.
export async function GET() {
  // Keeps this handler out of the build (see src/app/api/setup/status/route.ts).
  await connection();
  return NextResponse.json(getVersionInfo(), { headers: { 'Cache-Control': 'no-store' } });
}
