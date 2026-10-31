import { Pool, neon } from '@neondatabase/serverless';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

let poolInstance: Pool | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not defined.');
  }

  if (!poolInstance) {
    poolInstance = new Pool({ connectionString: url });
  }

  return drizzleServerless(poolInstance, { schema });
}

// Convenient export for standard server requests
export const db = new Proxy({} as ReturnType<typeof drizzleServerless<typeof schema>>, {
  get(_target, prop) {
    const database = getDb();
    // @ts-expect-error dynamic proxy delegate
    return database[prop];
  },
});
