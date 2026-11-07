import { NextResponse, connection } from 'next/server';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';

export async function GET() {
  // Cache Components prerenders a handler that touches no request-time data. Waiting for the
  // request keeps `next build` from running this handler (and from querying the database with
  // DATABASE_URL set) and from freezing its answer. `dynamic = 'force-dynamic'` is not allowed here.
  await connection();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ setupRequired: true, databaseConnected: false });
  }

  try {
    const userRepository = new DrizzleUserRepository();
    const hasUsers = await userRepository.hasAnyUser();
    return NextResponse.json({ setupRequired: !hasUsers, databaseConnected: true });
  } catch (error) {
    console.error('Error checking setup status:', error);
    // If DATABASE_URL is not configured yet or connection fails, inform client
    return NextResponse.json(
      { error: 'Não foi possível verificar o status de instalação.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
