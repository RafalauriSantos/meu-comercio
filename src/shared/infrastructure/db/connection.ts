import { Pool } from '@neondatabase/serverless';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

let dbInstance: ReturnType<typeof drizzleServerless<typeof schema>> | null = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not defined.');
  }

  const pool = new Pool({ connectionString: url });
  dbInstance = drizzleServerless(pool, { schema });
  return dbInstance;
}

// Convenient export for standard server requests
export const db = new Proxy({} as ReturnType<typeof drizzleServerless<typeof schema>>, {
  get(_target, prop) {
    const database = getDb();
    // @ts-expect-error dynamic proxy delegate
    return database[prop];
  },
});
