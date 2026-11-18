import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { ean13CheckDigit, generateBarcode, isValidEan13 } from '../domain/generated-barcode';

// Migration 0005 (D-24 bulk swap of 'SEM-' codes), tried on FICTITIOUS data only.
// Runs only when TEST_DATABASE_URL points to a disposable Postgres. Each scenario gets its own throwaway
// database, cloned from a template migrated up to 0004 (the migration right before this one).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = 'drizzle/migrations';
const MIGRATION_TAG = '0005_replace_sem_barcodes';
const SYSTEM_ACTOR = 'system:migration-0005';
const SOURCE = 'migration:0005_replace_sem_barcodes';

const MIGRATION_SQL = readFileSync(`${MIGRATIONS}/${MIGRATION_TAG}.sql`, 'utf8').replaceAll('\r\n', '\n');
const STATEMENTS = MIGRATION_SQL.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
const PREVIEW_SQL = readFileSync('scripts/replace-sem-barcodes-preview.sql', 'utf8');
const REVERT_SQL = readFileSync('scripts/replace-sem-barcodes-revert.sql', 'utf8');

// Merchants and products with fixed ids, so the order the migration visits them (merchant_id, id) is known.
const SHOP_A = '00000000-0000-0000-0000-00000000000a';
const SHOP_B = '00000000-0000-0000-0000-00000000000b';
const SHOP_C = '00000000-0000-0000-0000-00000000000c';
const pid = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// The digit i (0-9) of a scripted random() source: floor(random() * 10) gives back exactly i.
const codeOfDigit = (d: number) => generateBarcode(() => d / 10);

describe.skipIf(!TEST_DATABASE_URL)('migration 0005 replace SEM- barcodes (Postgres, fictitious data)', () => {
  let admin: Pool;
  let baseName: string;
  const toUrl = (name: string) => {
    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    const text = url.toString();
    assertDisposableTestDatabase(text);
    return text;
  };

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    admin = new Pool({ connectionString: TEST_DATABASE_URL });
    baseName = `sem_swap_${randomBytes(4).toString('hex')}_base_test`;
    await admin.query(`CREATE DATABASE ${baseName}`);

    // Migrations 0000 to 0004 only: a copy of the folder with the journal cut before 0005.
    const folder = mkdtempSync(join(tmpdir(), 'sem-swap-migrations-'));
    mkdirSync(join(folder, 'meta'));
    for (const file of readdirSync(MIGRATIONS)) {
      if (file.endsWith('.sql') && !file.startsWith('0005')) cpSync(join(MIGRATIONS, file), join(folder, file));
    }
    const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8'));
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag !== MIGRATION_TAG);
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));

    const pool = new Pool({ connectionString: toUrl(baseName) });
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.end(); // a template database cannot have open connections
  });

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${baseName} WITH (FORCE)`);
    await admin.end();
  });

  // A clone of the template (state right before 0005), thrown away at the end of the scenario.
  async function withDb(fn: (c: PoolClient, pool: Pool) => Promise<void>) {
    const name = `sem_swap_${randomBytes(4).toString('hex')}_test`;
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${baseName}`);
    const pool = new Pool({ connectionString: toUrl(name) });
    const client = await pool.connect();
    try {
      await fn(client, pool);
    } finally {
      client.release();
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  }

  // Like the drizzle migrator: every statement of the file, inside one transaction.
  async function applyMigration(c: PoolClient) {
    await c.query('BEGIN');
    try {
      for (const statement of STATEMENTS) await c.query(statement);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  }

  async function addProduct(c: PoolClient, p: { id?: string; shop: string; barcode: string; name: string; active?: boolean }) {
    const { rows } = await c.query(
      `INSERT INTO products (id, merchant_id, barcode, name, sale_price, active)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, '9.9000', $5) RETURNING id`,
      [p.id ?? null, p.shop, p.barcode, p.name, p.active ?? true],
    );
    return rows[0].id as string;
  }

  // Invented shops and products. Sales and stock hang on SEM- products (and on a normal one).
  async function seed(c: PoolClient) {
    for (const [id, name] of [[SHOP_A, 'Mercearia Aurora (ficticia)'], [SHOP_B, 'Padaria Bela Vista (ficticia)'], [SHOP_C, 'Loja Sem Codigos (ficticia)']]) {
      await c.query('INSERT INTO merchants (id, name) VALUES ($1, $2)', [id, name]);
    }
    const ids: Record<string, string> = {};
    const add = async (key: string, shop: string, barcode: string, name: string, active = true) => {
      ids[key] = await addProduct(c, { shop, barcode, name, active });
    };
    // Shop A: 6 sem-<digits> in any letter case (one inactive), and every kind of code that must stay.
    await add('a-sem1', SHOP_A, 'SEM-1001', 'Biscoito Imaginario');
    await add('a-sem2', SHOP_A, 'SEM-1002', 'Refresco Inventado', false);
    await add('a-sem3', SHOP_A, 'SEM-32354', 'Arroz de Mentira');
    await add('a-lower', SHOP_A, 'sem-123', 'Feijao Minusculo');
    await add('a-lower2', SHOP_A, 'sem-32354', 'Arroz de Mentira Minusculo');
    await add('a-mixed', SHOP_A, 'Sem-5', 'Cafe Misto');
    // sem- with something other than digits after the hyphen: kept.
    await add('a-semabc', SHOP_A, 'SEM-ABC', 'Item Letras');
    await add('a-sem12a', SHOP_A, 'sem-12a', 'Item Digitos e Letra');
    await add('a-semempty', SHOP_A, 'sem-', 'Item Hifen Sozinho');
    await add('a-sem1dash2', SHOP_A, 'sem-1-2', 'Item Dois Hifens');
    await add('a-ean8', SHOP_A, '12345670', 'Bala EAN8');
    await add('a-upc', SHOP_A, '036000291452', 'Sabonete UPC12');
    await add('a-ean13', SHOP_A, '7891000100103', 'Leite EAN13 Comum');
    await add('a-gen', SHOP_A, '2912345678906', 'Pao Ja Gerado');
    await add('a-badcheck', SHOP_A, '7891000100104', 'Suco Digito Errado');
    await add('a-other', SHOP_A, 'ABC-99', 'Item Formato Livre');
    // Shop B: the same SEM- text as shop A (allowed: unique per shop), one inactive, and a normal EAN-13 equal to A's.
    await add('b-sem1', SHOP_B, 'SEM-1001', 'Bolo Fantasia');
    await add('b-sem2', SHOP_B, 'SEM-2000', 'Torta Sonhada', false);
    await add('b-ean13', SHOP_B, '7891000100103', 'Leite EAN13 Comum B');
    // Shop C: nothing to replace.
    await add('c-ean13', SHOP_C, '7891000100103', 'Leite EAN13 Comum C');

    for (const shop of [SHOP_A, SHOP_B]) {
      const { rows: [session] } = await c.query(
        `INSERT INTO cash_sessions (merchant_id, opened_by, opening_balance, status, closed_by, closing_balance, closed_at)
         VALUES ($1, 'dona-ficticia', '100', 'CLOSED', 'dona-ficticia', '100', now()) RETURNING id`,
        [shop],
      );
      const { rows: [sale] } = await c.query(
        `INSERT INTO sales (merchant_id, cash_session_id, operator_id, status, subtotal, total)
         VALUES ($1, $2, 'op-ficticia', 'PAID', '30', '30') RETURNING id`,
        [shop, session.id],
      );
      const keys = shop === SHOP_A ? ['a-sem1', 'a-sem2', 'a-lower', 'a-ean13'] : ['b-sem1', 'b-sem2'];
      for (const key of keys) {
        await c.query(
          `INSERT INTO sale_items (merchant_id, sale_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, '10', 1, '10')`,
          [shop, sale.id, ids[key], key],
        );
        await c.query('INSERT INTO inventory_items (merchant_id, product_id, available_quantity) VALUES ($1, $2, 7)', [shop, ids[key]]);
        await c.query(
          `INSERT INTO inventory_movements (merchant_id, product_id, movement_type, quantity, reason, actor_id)
           VALUES ($1, $2, 'ENTRY', 8, 'estoque ficticio', 'dona-ficticia')`,
          [shop, ids[key]],
        );
      }
    }
    return ids;
  }

  async function snapshot(c: PoolClient) {
    const rows = async (sql: string) => (await c.query(sql)).rows;
    return {
      products: await rows('SELECT * FROM products ORDER BY id'),
      sales: await rows('SELECT * FROM sales ORDER BY id'),
      saleItems: await rows('SELECT * FROM sale_items ORDER BY id'),
      inventoryItems: await rows('SELECT * FROM inventory_items ORDER BY product_id'),
      inventoryMovements: await rows('SELECT * FROM inventory_movements ORDER BY id'),
      cashSessions: await rows('SELECT * FROM cash_sessions ORDER BY id'),
      auditEvents: await rows('SELECT * FROM audit_events ORDER BY id'),
    };
  }

  type Row = Record<string, unknown> & { id: string; barcode: string; merchant_id: string };
  const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r]));
  const SWAPPED_KEYS = ['a-sem1', 'a-sem2', 'a-sem3', 'a-lower', 'a-lower2', 'a-mixed', 'b-sem1', 'b-sem2'];
  const SEM_COUNT = SWAPPED_KEYS.length; // 8

  it('journal and file agree: 6 entries, 0005 is the last, tag matches the file', () => {
    const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8'));
    expect(journal.entries).toHaveLength(6);
    expect(journal.entries[5]).toMatchObject({ idx: 5, tag: MIGRATION_TAG, breakpoints: true });
    expect(journal.entries[5].when).toBeGreaterThan(journal.entries[4].when);
  });

  it('actor_id is NOT NULL in audit_events, which is why the audit actor is a fixed system text', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'audit_events' AND column_name = 'actor_id'`,
      );
      expect(rows).toEqual([{ is_nullable: 'NO' }]);
    });
  });

  it('replaces only sem-<digits> in any letter case; every other product stays byte for byte the same', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      const before = await snapshot(c);
      await applyMigration(c);
      const after = await snapshot(c);

      const beforeById = byId(before.products as Row[]);
      const afterById = byId(after.products as Row[]);
      expect(after.products).toHaveLength(before.products.length);
      const swapped = SWAPPED_KEYS.map((k) => ids[k]);
      expect(swapped).toHaveLength(SEM_COUNT);

      for (const [id, old] of beforeById) {
        const now = afterById.get(id)!;
        if (swapped.includes(id)) {
          expect(now.barcode).not.toBe(old.barcode);
          // Only barcode and updated_at moved: name, price, unit, active, shop, created_at are the same.
          expect({ ...now, barcode: null, updated_at: null }).toEqual({ ...old, barcode: null, updated_at: null });
          expect((now.updated_at as Date).getTime()).toBeGreaterThan((old.updated_at as Date).getTime());
        } else {
          expect(now).toEqual(old); // includes updated_at and barcode
        }
      }
      // The look-alikes that must not be touched, by name.
      for (const [key, code] of [['a-semabc', 'SEM-ABC'], ['a-sem12a', 'sem-12a'], ['a-semempty', 'sem-'], ['a-sem1dash2', 'sem-1-2'],
        ['a-ean8', '12345670'], ['a-upc', '036000291452'],
        ['a-ean13', '7891000100103'], ['a-gen', '2912345678906'], ['a-badcheck', '7891000100104'], ['a-other', 'ABC-99'],
        ['b-ean13', '7891000100103'], ['c-ean13', '7891000100103']]) {
        expect(afterById.get(ids[key])!.barcode).toBe(code);
      }
    });
  });

  it('new codes have 13 digits, prefix 29, a valid EAN-13 check digit, are unique per shop and distinct among themselves', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      await applyMigration(c);
      const { rows } = await c.query('SELECT id, merchant_id, barcode FROM products');
      const swappedIds = new Set(SWAPPED_KEYS.map((k) => ids[k]));
      const fresh = (rows as Row[]).filter((r) => swappedIds.has(r.id));
      expect(fresh).toHaveLength(SEM_COUNT);
      for (const r of fresh) {
        expect(r.barcode).toMatch(/^29\d{11}$/);
        expect(isValidEan13(r.barcode)).toBe(true);
      }
      expect(new Set(fresh.map((r) => r.barcode)).size).toBe(SEM_COUNT);
      const perShop = (rows as Row[]).map((r) => `${r.merchant_id}/${r.barcode}`);
      expect(new Set(perShop).size).toBe(perShop.length);
      // No sem-<digits> code (any case) is left.
      expect((rows as Row[]).filter((r) => /^sem-\d+$/i.test(r.barcode))).toEqual([]);
    });
  });

  it('sales, sale items, stock and cash sessions are identical (counts, ids and product links)', async () => {
    await withDb(async (c) => {
      await seed(c);
      const before = await snapshot(c);
      expect(before.saleItems).toHaveLength(6);
      expect(before.inventoryItems).toHaveLength(6);
      await applyMigration(c);
      const after = await snapshot(c);
      expect(after.sales).toEqual(before.sales);
      expect(after.saleItems).toEqual(before.saleItems); // same ids, same product_id
      expect(after.inventoryItems).toEqual(before.inventoryItems);
      expect(after.inventoryMovements).toEqual(before.inventoryMovements);
      expect(after.cashSessions).toEqual(before.cashSessions);
      // Each sale item still reaches its product, and the product now has the new code.
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM sale_items si JOIN products p ON p.id = si.product_id AND p.merchant_id = si.merchant_id`,
      );
      expect(rows[0].n).toBe(6);
    });
  });

  it('writes one PRODUCT_UPDATED audit per swap with from/to, the generated flag and the bulk marker, and none for the others', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      const before = byId((await snapshot(c)).products as Row[]);
      await applyMigration(c);
      const { rows: events } = await c.query('SELECT * FROM audit_events');
      const { rows: products } = await c.query('SELECT id, barcode FROM products');
      const now = new Map(products.map((p: Row) => [p.id, p.barcode]));

      expect(events).toHaveLength(SEM_COUNT);
      const swapped = SWAPPED_KEYS.map((k) => ids[k]);
      expect(events.map((e) => e.aggregate_id).sort()).toEqual([...swapped].sort());
      for (const e of events) {
        expect(e).toMatchObject({ event_type: 'PRODUCT_UPDATED', actor_id: SYSTEM_ACTOR, aggregate_type: 'PRODUCT' });
        expect(e.merchant_id).toBe(before.get(e.aggregate_id)!.merchant_id);
        expect(e.details).toEqual({
          changes: { barcode: { from: before.get(e.aggregate_id)!.barcode, to: now.get(e.aggregate_id) } },
          barcodeGenerated: true,
          source: SOURCE,
        });
      }
      // The old code is recoverable, with its original letter case: "from" is exactly the old sem-<digits> codes.
      expect(events.map((e) => e.details.changes.barcode.from).sort()).toEqual(
        ['SEM-1001', 'SEM-1001', 'SEM-1002', 'SEM-2000', 'SEM-32354', 'Sem-5', 'sem-123', 'sem-32354'],
      );
    });
  });

  it('is idempotent: a second run changes no product and writes no audit', async () => {
    await withDb(async (c) => {
      await seed(c);
      await applyMigration(c);
      const first = await snapshot(c);
      await applyMigration(c);
      const second = await snapshot(c);
      expect(second).toEqual(first);
      expect(second.auditEvents).toHaveLength(SEM_COUNT);
    });
  });

  it('runs through the real drizzle migrator, once, and leaves no helper function behind', async () => {
    await withDb(async (c, pool) => {
      await seed(c);
      const database = drizzle(pool);
      await migrate(database, { migrationsFolder: MIGRATIONS });
      const { rows: recorded } = await c.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
      expect(recorded[0].n).toBe(6);
      const afterFirst = await snapshot(c);
      expect((afterFirst.products as Row[]).filter((p) => /^sem-\d+$/i.test(p.barcode))).toEqual([]);
      expect(afterFirst.auditEvents).toHaveLength(SEM_COUNT);

      await migrate(database, { migrationsFolder: MIGRATIONS });
      expect(await snapshot(c)).toEqual(afterFirst);

      const { rows: leftovers } = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'tmp\\_%'`);
      expect(leftovers).toEqual([]);
    });
  });

  describe('SQL EAN-13 helpers (same vectors as the TypeScript generator tests)', () => {
    async function withHelpers(fn: (c: PoolClient) => Promise<void>) {
      await withDb(async (c) => {
        await c.query(STATEMENTS[0]);
        await c.query(STATEMENTS[1]);
        await fn(c);
      });
    }

    it('check digit vectors of generated-barcode.test.ts', async () => {
      await withHelpers(async (c) => {
        for (const [base, digit] of [['400638133393', 1], ['590123412345', 7], ['978020137962', 4], ['291234567890', 6]] as const) {
          const { rows } = await c.query('SELECT tmp_ean13_check_digit($1) AS d', [base]);
          expect(rows[0].d).toBe(digit);
        }
      });
    });

    it('agrees with the TypeScript check digit on 500 random inputs, and generated codes are valid EAN-13', async () => {
      await withHelpers(async (c) => {
        for (let n = 0; n < 500; n++) {
          const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
          const { rows } = await c.query('SELECT tmp_ean13_check_digit($1) AS d', [base]);
          expect(rows[0].d).toBe(ean13CheckDigit(base));
        }
        const { rows } = await c.query('SELECT tmp_generated_barcode() AS code FROM generate_series(1, 300)');
        for (const r of rows) {
          expect(r.code).toMatch(/^29\d{11}$/);
          expect(isValidEan13(r.code)).toBe(true);
        }
      });
    });
  });

  // Replaces random() by a script of digits (public.random shadows pg_catalog.random for this session only),
  // to decide which codes are drawn and in what order.
  async function scriptRandom(c: PoolClient, digits: string) {
    await c.query('CREATE TABLE test_script (digits text)');
    await c.query('INSERT INTO test_script VALUES ($1)', [digits]);
    await c.query('CREATE SEQUENCE test_seq');
    await c.query(
      `CREATE FUNCTION public.random() RETURNS double precision LANGUAGE sql AS
       $$ SELECT (substr((SELECT digits FROM test_script), nextval('test_seq')::integer, 1)::integer + 0.5) / 10 $$`,
    );
    await c.query('SET search_path = public, pg_catalog');
  }
  const drawsUsed = async (c: PoolClient) => {
    const { rows } = await c.query('SELECT is_called, last_value::int AS n FROM test_seq');
    return rows[0].is_called ? rows[0].n : 0;
  };

  it('collision: draws again against taken codes (active, inactive, and the ones this same run just made); other shops do not block', async () => {
    await withDb(async (c) => {
      // Draws, 10 digits each: 1111111111 x2, 2222222222 x2, 3333333333 x2, 4444444444.
      await seedMinimalShops(c);
      const p1 = await addProduct(c, { id: pid(1), shop: SHOP_A, barcode: 'SEM-1', name: 'Colisao Um' });
      const p2 = await addProduct(c, { id: pid(2), shop: SHOP_A, barcode: 'SEM-2', name: 'Colisao Dois' });
      const p3 = await addProduct(c, { id: pid(3), shop: SHOP_B, barcode: 'SEM-3', name: 'Colisao Tres' });
      // Taken before the run: 1111... by an INACTIVE product of shop A; 3333... by a product of shop B only.
      await addProduct(c, { shop: SHOP_A, barcode: codeOfDigit(1), name: 'Dono do 1', active: false });
      await addProduct(c, { shop: SHOP_B, barcode: codeOfDigit(3), name: 'Dono do 3 na loja B' });
      await scriptRandom(c, '1'.repeat(20) + '2'.repeat(20) + '3'.repeat(20) + '4'.repeat(10));

      await applyMigration(c);

      const code = async (id: string) => (await c.query('SELECT barcode FROM products WHERE id = $1', [id])).rows[0].barcode;
      // p1: draw 1 and 2 hit the inactive holder of 1111..., draw 3 (2222...) is free.
      expect(await code(p1)).toBe(codeOfDigit(2));
      // p2: draw 4 is 2222... again, which p1 got in THIS run, so it draws 3333...: free in shop A (the holder is in shop B).
      expect(await code(p2)).toBe(codeOfDigit(3));
      // p3 (shop B): draw 6 is 3333..., taken in shop B, so draw 7 (4444...).
      expect(await code(p3)).toBe(codeOfDigit(4));
      expect(await drawsUsed(c)).toBe(70); // 7 codes drawn for 3 products: 4 retries happened

      const { rows } = await c.query(`SELECT merchant_id, barcode FROM products`);
      const keys = rows.map((r: Row) => `${r.merchant_id}/${r.barcode}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('collision without way out (20 draws all taken): the whole migration fails with a generic message and nothing changes', async () => {
    await withDb(async (c) => {
      await seedMinimalShops(c);
      await addProduct(c, { id: pid(1), shop: SHOP_A, barcode: 'SEM-1', name: 'Preso Um' });
      await addProduct(c, { id: pid(2), shop: SHOP_B, barcode: 'SEM-2', name: 'Preso Dois' });
      await addProduct(c, { shop: SHOP_A, barcode: codeOfDigit(1), name: 'Dono do 1' });
      await scriptRandom(c, '1'.repeat(10 * 25));
      const before = await snapshot(c);

      await expect(applyMigration(c)).rejects.toThrow(/no free code after 20 draws for product/);
      await c.query('RESET search_path');
      expect(await snapshot(c)).toEqual(before);
    });
  });

  it('atomicity: a failure on the 3rd audit write leaves every product, audit and link untouched (transaction and autocommit)', async () => {
    await withDb(async (c) => {
      await seed(c); // 8 sem-digits products
      await c.query(`
        CREATE FUNCTION fail_on_third_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF (SELECT count(*) FROM audit_events) >= 2 THEN RAISE EXCEPTION 'forced failure on the 3rd audit write'; END IF;
          RETURN NEW;
        END $$`);
      await c.query('CREATE TRIGGER t_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_on_third_audit()');
      const before = await snapshot(c);

      // (a) the way the drizzle migrator runs it: one transaction around all statements.
      await expect(applyMigration(c)).rejects.toThrow(/forced failure/);
      expect(await snapshot(c)).toEqual(before);
      const { rows: funcs } = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'tmp\\_%'`);
      expect(funcs).toEqual([]); // the helper functions were rolled back too

      // (b) worst case, every statement on its own (no outer transaction): the DO block is still all or nothing.
      await expect(
        (async () => {
          for (const statement of STATEMENTS) await c.query(statement);
        })(),
      ).rejects.toThrow(/forced failure/);
      expect(await snapshot(c)).toEqual(before);
    });
  });

  it('revert: giving the old codes back from the audit restores every original code, and a second run does nothing', async () => {
    await withDb(async (c) => {
      await seed(c);
      const original = (await snapshot(c)).products as Row[];
      await applyMigration(c);
      const notices: string[] = [];
      c.on('notice', (n) => notices.push(String(n.message)));

      await c.query(REVERT_SQL);
      const reverted = (await c.query('SELECT * FROM products ORDER BY id')).rows as Row[];
      expect(reverted.map((r) => [r.id, r.barcode])).toEqual(original.map((r) => [r.id, r.barcode]));
      expect(String(notices.at(-1))).toMatch(/8 code\(s\) given back, 0 skipped/);
      const { rows: revertEvents } = await c.query(`SELECT * FROM audit_events WHERE actor_id = 'system:revert-0005'`);
      expect(revertEvents).toHaveLength(SEM_COUNT);

      const afterRevert = await snapshot(c);
      await c.query(REVERT_SQL);
      expect(await snapshot(c)).toEqual(afterRevert);
      expect(String(notices.at(-1))).toMatch(/0 code\(s\) given back, 8 skipped/);
    });
  });

  it('revert: skips a product whose old code was taken by someone else, and one the owner edited after the swap', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      await applyMigration(c);
      // The old code SEM-1001 of shop A got reused by a new product; the owner typed another code for SEM-32354.
      const taker = await addProduct(c, { shop: SHOP_A, barcode: 'SEM-1001', name: 'Novo Produto Mesmo Codigo' });
      await c.query(`UPDATE products SET barcode = '9990000000001' WHERE id = $1`, [ids['a-sem3']]);
      const notices: string[] = [];
      c.on('notice', (n) => notices.push(String(n.message)));

      await c.query(REVERT_SQL);

      const code = async (id: string) => (await c.query('SELECT barcode FROM products WHERE id = $1', [id])).rows[0].barcode;
      expect(await code(taker)).toBe('SEM-1001'); // untouched
      expect(await code(ids['a-sem1'])).toMatch(/^29\d{11}$/); // skipped, keeps the generated code
      expect(await code(ids['a-sem3'])).toBe('9990000000001'); // the owner's edit is kept
      expect(await code(ids['a-sem2'])).toBe('SEM-1002');
      expect(await code(ids['b-sem1'])).toBe('SEM-1001');
      expect(await code(ids['b-sem2'])).toBe('SEM-2000');
      // The original letter case comes back exactly.
      expect(await code(ids['a-lower'])).toBe('sem-123');
      expect(await code(ids['a-lower2'])).toBe('sem-32354');
      expect(await code(ids['a-mixed'])).toBe('Sem-5');
      expect(String(notices.at(-1))).toMatch(/6 code\(s\) given back, 2 skipped/);
    });
  });

  it('preview: read only, lists per shop what is replaced and what is kept with the reason, and changes nothing', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      const before = await snapshot(c);

      await c.query('BEGIN READ ONLY'); // the database itself would refuse any write in the script
      const results = (await c.query(PREVIEW_SQL)) as unknown as { rows: Record<string, unknown>[] }[];
      await c.query('ROLLBACK');

      expect(results).toHaveLength(2);
      const [detail, summary] = results.map((r) => r.rows);
      const reasonOf = (id: string) => detail.find((r) => r.product_id === id);
      for (const key of SWAPPED_KEYS) {
        expect(reasonOf(ids[key])).toMatchObject({ action: 'REPLACE', reason: 'sem- followed only by digits' });
      }
      expect(reasonOf(ids['a-sem2'])).toMatchObject({ active: false, has_sales: true, has_stock_movement: true });
      expect(reasonOf(ids['a-sem3'])).toMatchObject({ active: true, has_sales: false, has_stock_movement: false });
      expect(reasonOf(ids['a-lower'])).toMatchObject({ action: 'REPLACE', barcode: 'sem-123' });
      for (const key of ['a-semabc', 'a-sem12a', 'a-semempty', 'a-sem1dash2']) {
        expect(reasonOf(ids[key])).toMatchObject({ action: 'KEEP', reason: 'sem- com outro formato' });
      }
      expect(reasonOf(ids['a-ean8'])).toMatchObject({ action: 'KEEP', reason: 'EAN-8' });
      expect(reasonOf(ids['a-upc'])).toMatchObject({ action: 'KEEP', reason: 'UPC-12' });
      expect(reasonOf(ids['a-badcheck'])).toMatchObject({ action: 'KEEP', reason: '13 digits, invalid check digit' });
      expect(reasonOf(ids['a-other'])).toMatchObject({ action: 'KEEP', reason: 'other format' });
      // Valid EAN-13 (common or generated) are not listed in the detail, only counted in the summary.
      expect(reasonOf(ids['a-ean13'])).toBeUndefined();
      expect(reasonOf(ids['a-gen'])).toBeUndefined();

      const row = (shop: string, action: string, reason: string) =>
        summary.find((r) => r.merchant_id === shop && r.action === action && r.reason === reason);
      expect(row(SHOP_A, 'REPLACE', 'sem- followed only by digits')).toMatchObject({ products: 6, active_products: 5, inactive_products: 1 });
      expect(row(SHOP_B, 'REPLACE', 'sem- followed only by digits')).toMatchObject({ products: 2, active_products: 1, inactive_products: 1 });
      expect(row(SHOP_A, 'KEEP', 'sem- com outro formato')).toMatchObject({ products: 4 });
      expect(summary.some((r) => String(r.reason).includes('another letter case'))).toBe(false); // old reason is gone
      expect(row(SHOP_A, 'KEEP', 'valid EAN-13 (generated 29...)')).toMatchObject({ products: 1 });
      expect(row(SHOP_A, 'KEEP', 'valid EAN-13')).toMatchObject({ products: 1 });
      expect(row(SHOP_C, 'REPLACE', 'sem- followed only by digits')).toBeUndefined();

      // What the preview announced is what the migration does.
      expect(await snapshot(c)).toEqual(before);
      await applyMigration(c);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM audit_events`);
      expect(rows[0].n).toBe(detail.filter((r) => r.action === 'REPLACE').length);
    });
  });

  async function seedMinimalShops(c: PoolClient) {
    await c.query('INSERT INTO merchants (id, name) VALUES ($1, $2), ($3, $4)', [SHOP_A, 'Loja A (ficticia)', SHOP_B, 'Loja B (ficticia)']);
  }
});
