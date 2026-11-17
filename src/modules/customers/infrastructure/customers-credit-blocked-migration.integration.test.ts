import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = 'drizzle/migrations';

describe.skipIf(!TEST_DATABASE_URL)('migration customers.credit_blocked (Postgres)', () => {
  let pool: Pool;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('adds the column as boolean NOT NULL DEFAULT false', async () => {
    const { rows } = await pool.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'customers' AND column_name = 'credit_blocked'`,
    );
    expect(rows).toEqual([{ data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }]);
  });

  it('leaves customers that already existed unblocked', async () => {
    const file = readdirSync(MIGRATIONS).find(
      (name) => name.endsWith('.sql') && readFileSync(`${MIGRATIONS}/${name}`, 'utf8').includes('credit_blocked'),
    );
    expect(file).toBeDefined();
    const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8').replaceAll('--> statement-breakpoint', '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Back to the state before the migration, with a customer already there.
      await client.query('ALTER TABLE customers DROP COLUMN credit_blocked');
      const merchant = await client.query(`INSERT INTO merchants (name) VALUES ('Loja migracao') RETURNING id`);
      await client.query(`INSERT INTO customers (merchant_id, name, phone) VALUES ($1, 'Antigo', '11999990000')`, [
        merchant.rows[0].id,
      ]);
      await client.query(sql);
      const { rows } = await client.query(`SELECT credit_blocked FROM customers WHERE name = 'Antigo'`);
      expect(rows).toEqual([{ credit_blocked: false }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
