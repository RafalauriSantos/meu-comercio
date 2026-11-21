import { eq } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { appUsers } from './users.schema';
import { RecoveryDatabase } from './recovery-database';

/** One SELECT by primary key. Takes the database so the integration test can use its own. */
export async function readCredentialsChangedAt<TSchema extends Record<string, unknown>>(
  database: RecoveryDatabase<TSchema>,
  username: string
): Promise<Date | null> {
  const [row] = await database
    .select({ changedAt: appUsers.credentialsChangedAt })
    .from(appUsers)
    .where(eq(appUsers.username, username))
    .limit(1);
  return row?.changedAt ?? null;
}

/** When the owner last changed the password (D-32), or null. */
export const getCredentialsChangedAt = (username: string) => readCredentialsChangedAt(db, username);
