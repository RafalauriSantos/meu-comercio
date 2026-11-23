import { NextResponse, connection } from 'next/server';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import { sqlStateOf } from '@/shared/infrastructure/http/driver-error';

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
    // Public route: the error stays in the server log. Its message can hold the SQL and its parameters.
    console.error('Error checking setup status, SQLSTATE', sqlStateOf(error) ?? 'unknown');
    return NextResponse.json({ error: 'Não foi possível verificar o status de instalação.' }, { status: 500 });
  }
}
