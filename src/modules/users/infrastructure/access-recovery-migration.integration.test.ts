import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATION = readFileSync('drizzle/migrations/0006_access_recovery.sql', 'utf8').replaceAll(
  '--> statement-breakpoint',
  '',
);
// The script has its own BEGIN/COMMIT; the test runs it inside its own transaction that is rolled back.
const REVERT = readFileSync('scripts/access-recovery-revert.sql', 'utf8').replace(/^(BEGIN|COMMIT);\r?$/gm, '');

describe.skipIf(!TEST_DATABASE_URL)('migration 0006 access recovery (Postgres)', () => {
  let pool: Pool;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function columns(table: string) {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = $1 AND column_name = ANY($2) ORDER BY column_name`,
      [
        table,
        table === 'app_users'
          ? ['email_verified_at', 'credentials_changed_at']
          : table === 'owner_recovery_tokens'
            ? ['purpose', 'email']
            : ['id', 'scope', 'key_hash', 'created_at'],
      ],
    );
    return rows;
  }

  it('adds only nullable columns without default to app_users and owner_recovery_tokens', async () => {
    for (const table of ['app_users', 'owner_recovery_tokens']) {
      const rows = await columns(table);
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row).toMatchObject({ is_nullable: 'YES', column_default: null });
    }
  });

  it('creates access_recovery_requests with scope and key_hash required', async () => {
    const rows = await columns('access_recovery_requests');
    expect(Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]))).toEqual({
      created_at: 'NO',
      id: 'NO',
      key_hash: 'NO',
      scope: 'NO',
    });
  });

  it('keeps existing users and links untouched, with the new fields empty (migration and revert in a rolled back transaction)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Back to the state before the migration, with rows already there.
      await client.query(REVERT);
      const merchant = await client.query(`INSERT INTO merchants (name) VALUES ('Loja migracao') RETURNING id`);
      const merchantId = merchant.rows[0].id;
      const other = await client.query(`INSERT INTO merchants (name) VALUES ('Outra loja migracao') RETURNING id`);
      await client.query(
        `INSERT INTO app_users (username, merchant_id, password_hash, email) VALUES ('antiga', $1, 'x', 'a@b.com'), ('sememail', $1, 'x', NULL), ('duplicada', $2, 'x', 'a@b.com')`,
        [merchantId, other.rows[0].id],
      );
      await client.query(
        `INSERT INTO owner_recovery_tokens (merchant_id, username, token_hash, expires_at) VALUES ($1, 'antiga', $2, now())`,
        [merchantId, 'h'.repeat(64)],
      );
      await client.query(MIGRATION);
      // The same e-mail already in two shops must not break the migration.
      const users = await client.query(
        `SELECT username, email, email_verified_at, credentials_changed_at FROM app_users WHERE merchant_id = ANY($1) ORDER BY username`,
        [[merchantId, other.rows[0].id]],
      );
      expect(users.rows).toEqual([
        { username: 'antiga', email: 'a@b.com', email_verified_at: null, credentials_changed_at: null },
        { username: 'duplicada', email: 'a@b.com', email_verified_at: null, credentials_changed_at: null },
        { username: 'sememail', email: null, email_verified_at: null, credentials_changed_at: null },
      ]);
      const tokens = await client.query(`SELECT username, purpose, email FROM owner_recovery_tokens WHERE merchant_id = $1`, [merchantId]);
      expect(tokens.rows).toEqual([{ username: 'antiga', purpose: null, email: null }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  describe('unique index on verified e-mail', () => {
    async function inTransaction(fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<void>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn((sql, params) => client.query(sql, params));
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }
    const user = `INSERT INTO app_users (username, merchant_id, password_hash, email, email_verified_at) VALUES ($1, $2, 'x', $3, $4)`;

    it('refuses a second verified owner with the same e-mail in another shop, but allows unverified duplicates', async () => {
      await inTransaction(async (q) => {
        const m1 = (await q(`INSERT INTO merchants (name) VALUES ('L1') RETURNING id`)) as { rows: { id: string }[] };
        const m2 = (await q(`INSERT INTO merchants (name) VALUES ('L2') RETURNING id`)) as { rows: { id: string }[] };
        const m3 = (await q(`INSERT INTO merchants (name) VALUES ('L3') RETURNING id`)) as { rows: { id: string }[] };
        const m4 = (await q(`INSERT INTO merchants (name) VALUES ('L4') RETURNING id`)) as { rows: { id: string }[] };
        await q(user, ['u1', m1.rows[0].id, 'x@y.com', new Date()]);
        await q(user, ['u2', m2.rows[0].id, 'x@y.com', null]);
        await q(user, ['u3', m3.rows[0].id, 'x@y.com', null]);
        await expect(q(user, ['u4', m4.rows[0].id, 'x@y.com', new Date()])).rejects.toMatchObject({
          code: '23505',
          constraint: 'uq_app_users_verified_email',
        });
      });
    });
  });

  it('has the index that serves the request count by scope, key and time', async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_access_recovery_requests_scope_key_created'`,
    );
    expect(rows[0].indexdef).toContain('(scope, key_hash, created_at)');
  });
});
