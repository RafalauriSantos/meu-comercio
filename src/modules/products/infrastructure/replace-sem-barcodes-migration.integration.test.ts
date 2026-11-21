import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { generateBarcode, isValidEan13 } from '../domain/generated-barcode';

// Migration 0005 (D-24 bulk swap of every code that is not a valid barcode), tried on FICTITIOUS data only.
// Runs only when TEST_DATABASE_URL points to a disposable Postgres. Each scenario gets its own throwaway
// database, cloned from a template migrated up to 0004 (the migration right before this one).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = 'drizzle/migrations';
const MIGRATION_TAG = '0005_replace_sem_barcodes';
const SYSTEM_ACTOR = 'system:migration-0005';
const SOURCE = 'migration:0005_replace_sem_barcodes';

const MIGRATION_SQL = readFileSync(`${MIGRATIONS}/${MIGRATION_TAG}.sql`, 'utf8').replaceAll('\r\n', '\n');
const STATEMENTS = MIGRATION_SQL.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
const HELPER_STATEMENTS = STATEMENTS.filter((s) => /^\s*CREATE FUNCTION/m.test(s));
const PREVIEW_SQL = readFileSync('scripts/replace-sem-barcodes-preview.sql', 'utf8');
const REVERT_SQL = readFileSync('scripts/replace-sem-barcodes-revert.sql', 'utf8');

// Merchants and products with fixed ids, so the order the migration visits them (merchant_id, id) is known.
const SHOP_A = '00000000-0000-0000-0000-00000000000a';
const SHOP_B = '00000000-0000-0000-0000-00000000000b';
const SHOP_C = '00000000-0000-0000-0000-00000000000c';
const pid = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// The digit i (0-9) of a scripted random() source: floor(random() * 10) gives back exactly i.
const codeOfDigit = (d: number) => generateBarcode(() => d / 10);

// Reference check digit written from the rule in D-24, independent of the SQL (weights 3,1 from the left for
// 8, 12 and 14 digits, 1,3 for the 13 digits of EAN-13).
function refCheck(data: string): number {
  const total = data.length + 1;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const weight = total === 13 ? (i % 2 === 0 ? 1 : 3) : i % 2 === 0 ? 3 : 1;
    sum += Number(data[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}
const withCheck = (data: string) => data + refCheck(data);
const withWrongCheck = (data: string) => data + ((refCheck(data) + 1) % 10);
function refValid(code: string): boolean {
  if (!/^[0-9]+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  return refCheck(code.slice(0, -1)) === Number(code.at(-1));
}

type Case = { key: string; shop: string; code: string; name: string; active?: boolean; sales?: boolean; reason: string };

// Every kind of code that must be REPLACED, one or more of each category, with the reason the preview must give.
const REPLACE_CASES: Case[] = [
  // sem- in any form (10 cases)
  { key: 'a-sem1', shop: SHOP_A, code: 'SEM-1001', name: 'Biscoito Imaginario', sales: true, reason: 'sem-' },
  { key: 'a-sem2', shop: SHOP_A, code: 'SEM-1002', name: 'Refresco Inventado', active: false, sales: true, reason: 'sem-' },
  { key: 'a-sem3', shop: SHOP_A, code: 'SEM-32354', name: 'Arroz de Mentira', reason: 'sem-' },
  { key: 'a-lower', shop: SHOP_A, code: 'sem-123', name: 'Feijao Minusculo', sales: true, reason: 'sem-' },
  { key: 'a-lower2', shop: SHOP_A, code: 'sem-32354', name: 'Arroz de Mentira Minusculo', reason: 'sem-' },
  { key: 'a-mixed', shop: SHOP_A, code: 'Sem-5', name: 'Cafe Misto', reason: 'sem-' },
  { key: 'a-semabc', shop: SHOP_A, code: 'SEM-ABC', name: 'Item Letras', reason: 'sem-' },
  { key: 'a-sem12a', shop: SHOP_A, code: 'sem-12a', name: 'Item Digitos e Letra', reason: 'sem-' },
  { key: 'a-semempty', shop: SHOP_A, code: 'sem-', name: 'Item Hifen Sozinho', reason: 'sem-' },
  { key: 'a-sem1dash2', shop: SHOP_A, code: 'sem-1-2', name: 'Item Dois Hifens', reason: 'sem-' },
  // only digits, a size that is not 8, 12, 13 or 14
  { key: 'a-d3', shop: SHOP_A, code: '123', name: 'Item Tres Numeros', reason: 'only digits, invalid size' },
  { key: 'a-d10', shop: SHOP_A, code: '1234567890', name: 'Item Dez Numeros', reason: 'only digits, invalid size' },
  { key: 'a-d9', shop: SHOP_A, code: '123456789', name: 'Item Nove Numeros', reason: 'only digits, invalid size' },
  // letters
  { key: 'a-let', shop: SHOP_A, code: 'abcdefg', name: 'Item So Letras', active: false, reason: 'only letters' },
  { key: 'a-acc', shop: SHOP_A, code: 'kgçgukgç', name: 'Item Letras e Acento', reason: 'only letters' },
  { key: 'a-alnum', shop: SHOP_A, code: 'ab12cd', name: 'Item Letras e Numeros', reason: 'letters and numbers' },
  // symbols and spaces
  { key: 'a-sym', shop: SHOP_A, code: 'AB-12/3', name: 'Item Simbolos', reason: 'symbol or space' },
  { key: 'a-space', shop: SHOP_A, code: '12 34', name: 'Item Com Espaco', reason: 'symbol or space' },
  { key: 'a-trail', shop: SHOP_A, code: '7891000100103 ', name: 'Item Espaco no Fim', reason: 'symbol or space' },
  // empty
  { key: 'a-empty', shop: SHOP_A, code: '', name: 'Item Vazio', sales: true, reason: 'empty or only spaces' },
  { key: 'a-blank', shop: SHOP_A, code: '   ', name: 'Item So Espacos', reason: 'empty or only spaces' },
  // wrong check digit, one of each type
  { key: 'a-bad13', shop: SHOP_A, code: '7891000100104', name: 'Suco Digito Errado', sales: true, reason: 'wrong check digit EAN-13' },
  { key: 'a-bad8', shop: SHOP_A, code: '12345671', name: 'Bala Digito Errado', reason: 'wrong check digit EAN-8' },
  { key: 'a-badupc', shop: SHOP_A, code: '036000291453', name: 'Sabonete Digito Errado', reason: 'wrong check digit UPC-A' },
  { key: 'a-bad14', shop: SHOP_A, code: '17891000100101', name: 'Caixa Digito Errado', reason: 'wrong check digit GTIN-14' },
  // Shop B: same texts as shop A are fine (unique per shop)
  { key: 'b-sem1', shop: SHOP_B, code: 'SEM-1001', name: 'Bolo Fantasia', sales: true, reason: 'sem-' },
  { key: 'b-sem2', shop: SHOP_B, code: 'SEM-2000', name: 'Torta Sonhada', active: false, sales: true, reason: 'sem-' },
  { key: 'b-bad13', shop: SHOP_B, code: '7891000100104', name: 'Suco B Digito Errado', reason: 'wrong check digit EAN-13' },
  { key: 'b-let', shop: SHOP_B, code: 'abcdefg', name: 'Item B So Letras', reason: 'only letters' },
];

// Valid codes of every type: they must stay byte for byte the same.
const KEEP_CASES: Case[] = [
  { key: 'a-ean13', shop: SHOP_A, code: '7891000100103', name: 'Leite EAN13 Comum', sales: true, reason: 'valid EAN-13' },
  { key: 'a-ean8', shop: SHOP_A, code: '12345670', name: 'Bala EAN8', reason: 'valid EAN-8' },
  { key: 'a-upc', shop: SHOP_A, code: '036000291452', name: 'Sabonete UPC-A', reason: 'valid UPC-A' },
  { key: 'a-gtin14', shop: SHOP_A, code: '17891000100100', name: 'Caixa GTIN14', reason: 'valid GTIN-14' },
  { key: 'a-gen', shop: SHOP_A, code: '2912345678906', name: 'Pao Ja Gerado', reason: 'valid EAN-13' },
  { key: 'b-ean13', shop: SHOP_B, code: '7891000100103', name: 'Leite EAN13 Comum B', reason: 'valid EAN-13' },
  { key: 'c-ean13', shop: SHOP_C, code: '7891000100103', name: 'Leite EAN13 Comum C', reason: 'valid EAN-13' },
];

const N = REPLACE_CASES.length;
const SALES_COUNT = [...REPLACE_CASES, ...KEEP_CASES].filter((c) => c.sales).length;
const SWAPPED_KEYS = REPLACE_CASES.map((c) => c.key);

describe.skipIf(!TEST_DATABASE_URL)('migration 0005 replace invalid barcodes (Postgres, fictitious data)', () => {
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
    admin = newPool(TEST_DATABASE_URL!);
    baseName = `sem_swap_${randomBytes(4).toString('hex')}_base_test`;
    await admin.query(`CREATE DATABASE ${baseName}`);

    // Migrations 0000 to 0004 only: a copy of the folder with the journal cut before 0005 (later ones are left out too).
    const folder = mkdtempSync(join(tmpdir(), 'sem-swap-migrations-'));
    mkdirSync(join(folder, 'meta'));
    for (const file of readdirSync(MIGRATIONS)) {
      if (file.endsWith('.sql') && Number(file.slice(0, 4)) < 5) cpSync(join(MIGRATIONS, file), join(folder, file));
    }
    const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8'));
    journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 5);
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));

    const pool = newPool(toUrl(baseName));
    try {
      await migrate(drizzle(pool), { migrationsFolder: folder });
    } finally {
      await pool.end(); // a template database cannot have open connections
    }
  });

  afterAll(async () => {
    await dropDatabase(baseName);
    await admin.end();
  });

  // Every pool made by this test has an error listener, so a connection dropped by the server is never an unhandled error.
  function newPool(url: string): Pool {
    const pool = new Pool({ connectionString: url });
    pool.on('error', () => {});
    return pool;
  }

  // Nothing is connected when this runs (the pools were ended first), so a plain DROP is enough.
  // FORCE is only the safety net if a connection is somehow still open.
  async function dropDatabase(name: string) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    } catch {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  }

  // A clone of the template (state right before 0005), thrown away at the end of the scenario.
  async function withDb(fn: (c: PoolClient, pool: Pool) => Promise<void>) {
    const name = `sem_swap_${randomBytes(4).toString('hex')}_test`;
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${baseName}`);
    const pool = newPool(toUrl(name));
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      client.on('error', () => {});
      await fn(client, pool);
    } finally {
      // End every connection first (also when the scenario failed in the middle), then drop the database.
      client?.release(true);
      await pool.end().catch(() => {});
      await dropDatabase(name);
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

  async function seedMinimalShops(c: PoolClient) {
    await c.query('INSERT INTO merchants (id, name) VALUES ($1, $2), ($3, $4)', [SHOP_A, 'Loja A (ficticia)', SHOP_B, 'Loja B (ficticia)']);
  }

  // Invented shops and products. Sales and stock hang on some replaced products and on a valid one.
  async function seed(c: PoolClient) {
    for (const [id, name] of [[SHOP_A, 'Mercearia Aurora (ficticia)'], [SHOP_B, 'Padaria Bela Vista (ficticia)'], [SHOP_C, 'Loja Sem Codigos (ficticia)']]) {
      await c.query('INSERT INTO merchants (id, name) VALUES ($1, $2)', [id, name]);
    }
    const ids: Record<string, string> = {};
    for (const p of [...REPLACE_CASES, ...KEEP_CASES]) {
      ids[p.key] = await addProduct(c, { shop: p.shop, barcode: p.code, name: p.name, active: p.active });
    }
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
      for (const p of [...REPLACE_CASES, ...KEEP_CASES].filter((x) => x.shop === shop && x.sales)) {
        await c.query(
          `INSERT INTO sale_items (merchant_id, sale_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, '10', 1, '10')`,
          [shop, sale.id, ids[p.key], p.key],
        );
        await c.query('INSERT INTO inventory_items (merchant_id, product_id, available_quantity) VALUES ($1, $2, 7)', [shop, ids[p.key]]);
        await c.query(
          `INSERT INTO inventory_movements (merchant_id, product_id, movement_type, quantity, reason, actor_id)
           VALUES ($1, $2, 'ENTRY', 8, 'estoque ficticio', 'dona-ficticia')`,
          [shop, ids[p.key]],
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

  it('journal and file agree: 0005 is entry 5, tag matches the file', () => {
    const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8'));
    expect(journal.entries.length).toBeGreaterThanOrEqual(6);
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

  it('replaces every invalid code (each category) and leaves every valid code (each type) byte for byte the same', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      const before = await snapshot(c);
      await applyMigration(c);
      const after = await snapshot(c);

      const beforeById = byId(before.products as Row[]);
      const afterById = byId(after.products as Row[]);
      expect(after.products).toHaveLength(before.products.length);
      const swapped = SWAPPED_KEYS.map((k) => ids[k]);
      expect(swapped).toHaveLength(N);

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
      // The valid ones, by type, still carry their exact code.
      for (const p of KEEP_CASES) expect(afterById.get(ids[p.key])!.barcode).toBe(p.code);
    });
  });

  it('new codes have 13 digits, prefix 29, a valid EAN-13 check digit, are unique per shop and distinct among themselves', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      await applyMigration(c);
      const { rows } = await c.query('SELECT id, merchant_id, barcode FROM products');
      const swappedIds = new Set(SWAPPED_KEYS.map((k) => ids[k]));
      const fresh = (rows as Row[]).filter((r) => swappedIds.has(r.id));
      expect(fresh).toHaveLength(N);
      for (const r of fresh) {
        expect(r.barcode).toMatch(/^29\d{11}$/);
        expect(isValidEan13(r.barcode)).toBe(true);
      }
      expect(new Set(fresh.map((r) => r.barcode)).size).toBe(N);
      const perShop = (rows as Row[]).map((r) => `${r.merchant_id}/${r.barcode}`);
      expect(new Set(perShop).size).toBe(perShop.length);
      // Every code in the database is a valid barcode now.
      expect((rows as Row[]).filter((r) => !refValid(r.barcode))).toEqual([]);
    });
  });

  it('sales, sale items, stock and cash sessions are identical (counts, ids and product links)', async () => {
    await withDb(async (c) => {
      await seed(c);
      const before = await snapshot(c);
      expect(before.saleItems).toHaveLength(SALES_COUNT);
      expect(before.inventoryItems).toHaveLength(SALES_COUNT);
      await applyMigration(c);
      const after = await snapshot(c);
      expect(after.sales).toEqual(before.sales);
      expect(after.saleItems).toEqual(before.saleItems); // same ids, same product_id
      expect(after.inventoryItems).toEqual(before.inventoryItems);
      expect(after.inventoryMovements).toEqual(before.inventoryMovements);
      expect(after.cashSessions).toEqual(before.cashSessions);
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM sale_items si JOIN products p ON p.id = si.product_id AND p.merchant_id = si.merchant_id`,
      );
      expect(rows[0].n).toBe(SALES_COUNT);
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

      expect(events).toHaveLength(N);
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
      // The old code is recoverable exactly as it was (case, spaces, accents, empty).
      expect(events.map((e) => e.details.changes.barcode.from).sort()).toEqual(REPLACE_CASES.map((p) => p.code).sort());
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
      expect(second.auditEvents).toHaveLength(N);
    });
  });

  it('runs through the real drizzle migrator, once, and leaves no helper function behind', async () => {
    await withDb(async (c, pool) => {
      await seed(c);
      const database = drizzle(pool);
      await migrate(database, { migrationsFolder: MIGRATIONS });
      const { rows: recorded } = await c.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
      expect(recorded[0].n).toBe(JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, 'utf8')).entries.length);
      const afterFirst = await snapshot(c);
      expect((afterFirst.products as Row[]).filter((p) => !refValid(p.barcode))).toEqual([]);
      expect(afterFirst.auditEvents).toHaveLength(N);

      await migrate(database, { migrationsFolder: MIGRATIONS });
      expect(await snapshot(c)).toEqual(afterFirst);

      const { rows: leftovers } = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'tmp\\_%'`);
      expect(leftovers).toEqual([]);
    });
  });

  it('real-shaped set: 529 products (508 valid, 21 invalid) end with the 21 swapped and the 508 untouched', async () => {
    await withDb(async (c) => {
      await seedMinimalShops(c);
      type Item = { shop: string; code: string; invalid: boolean };
      const items: Item[] = [];
      const push = (code: string, invalid: boolean) => items.push({ shop: items.length % 2 === 0 ? SHOP_A : SHOP_B, code, invalid });
      for (let i = 1; i <= 496; i++) push(withCheck('78' + String(i * 7).padStart(10, '0')), false); // EAN-13
      for (let i = 1; i <= 10; i++) push(withCheck(String(2000000 + i * 13)), false); // EAN-8
      for (let i = 1; i <= 2; i++) push(withCheck('03' + String(100000000 + i * 17)), false); // UPC-A
      for (let i = 101; i <= 110; i++) push(`sem-${i}`, true);
      for (const code of ['123', '234', '789']) push(code, true);
      for (const code of ['abcdef', 'qwertyu', 'lkjhgfds', 'mnbvcxzas', 'poiuytrewqaz']) push(code, true);
      push('abçdefçg', true);
      push(withWrongCheck('78' + String(9999).padStart(10, '0')), true); // EAN-13, wrong digit
      push(withWrongCheck('03' + String(100000999)), true); // UPC-A, wrong digit
      expect(items).toHaveLength(529);
      expect(items.filter((i) => i.invalid)).toHaveLength(21);
      // The fixtures themselves agree with the reference rule.
      expect(items.every((i) => refValid(i.code) === !i.invalid)).toBe(true);

      await c.query(
        `INSERT INTO products (merchant_id, barcode, name, sale_price, active)
         SELECT s, b, 'Produto ficticio ' || n, '5.0000', true FROM unnest($1::uuid[], $2::text[], $3::int[]) AS t(s, b, n)`,
        [items.map((i) => i.shop), items.map((i) => i.code), items.map((_, n) => n + 1)],
      );
      const before = await snapshot(c);

      // The preview announces 21 replacements and the migration writes 21 audits.
      await c.query('BEGIN READ ONLY');
      const [detail, summary] = ((await c.query(PREVIEW_SQL)) as unknown as { rows: Record<string, unknown>[] }[]).map((r) => r.rows);
      await c.query('ROLLBACK');
      expect(detail).toHaveLength(21);
      const keptByType = (type: string) => summary.filter((r) => r.reason === type).reduce((s, r) => s + Number(r.products), 0);
      expect(keptByType('valid EAN-13')).toBe(496);
      expect(keptByType('valid EAN-8')).toBe(10);
      expect(keptByType('valid UPC-A')).toBe(2);

      await applyMigration(c);
      const after = await snapshot(c);
      const afterById = byId(after.products as Row[]);
      let changed = 0;
      for (const old of before.products as Row[]) {
        const now = afterById.get(old.id)!;
        if (refValid(old.barcode)) expect(now).toEqual(old);
        else {
          changed++;
          expect(isValidEan13(now.barcode) && now.barcode.startsWith('29')).toBe(true);
        }
      }
      expect(changed).toBe(21);
      expect(after.auditEvents).toHaveLength(21);
      expect(after.auditEvents.map((e) => e.details.changes.barcode.from).sort()).toEqual(
        items.filter((i) => i.invalid).map((i) => i.code).sort(),
      );
      const perShop = (after.products as Row[]).map((r) => `${r.merchant_id}/${r.barcode}`);
      expect(new Set(perShop).size).toBe(529);
    });
  });

  describe('SQL barcode helpers (same vectors as the TypeScript generator tests, plus the validity rule)', () => {
    async function withHelpers(fn: (c: PoolClient) => Promise<void>) {
      await withDb(async (c) => {
        for (const statement of HELPER_STATEMENTS) await c.query(statement);
        await fn(c);
      });
    }

    it('EAN-13 check digit vectors of generated-barcode.test.ts', async () => {
      await withHelpers(async (c) => {
        for (const [base, digit] of [['400638133393', 1], ['590123412345', 7], ['978020137962', 4], ['291234567890', 6]] as const) {
          const { rows } = await c.query('SELECT tmp_ean13_check_digit($1) AS d', [base]);
          expect(rows[0].d).toBe(digit);
        }
      });
    });

    it('validity vectors: each valid type is accepted, and each wrong check digit, size or character is refused', async () => {
      await withHelpers(async (c) => {
        const valid = ['4006381333931', '5901234123457', '7891000100103', '2912345678906', '12345670', '036000291452', '17891000100100'];
        const invalid = [
          '4006381333932', '7891000100104', '12345671', '036000291453', '17891000100101', // wrong check digit
          '40063813339a1', '1234567a', 'sem-123', 'SEM-1001', '', '   ', '7891000100103 ', ' 7891000100103', // not only digits
          '123', '1234567890', '123456789', '12345678901234567', '400638133393', // other sizes
        ];
        for (const code of valid) expect((await c.query('SELECT tmp_is_valid_barcode($1) AS v', [code])).rows[0].v).toBe(true);
        for (const code of invalid) expect((await c.query('SELECT tmp_is_valid_barcode($1) AS v', [code])).rows[0].v).toBe(false);
      });
    });

    it('agrees with the TypeScript reference on 1500 random inputs (valid, one digit off, wrong size, letters)', async () => {
      await withHelpers(async (c) => {
        const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
        const samples: string[] = [];
        for (let n = 0; n < 300; n++) {
          for (const len of [8, 12, 13, 14]) {
            samples.push(withCheck(digits(len - 1))); // valid
            samples.push(withWrongCheck(digits(len - 1))); // wrong check digit
          }
          samples.push(digits(1 + Math.floor(Math.random() * 20))); // any size
          samples.push(digits(7) + 'x'); // a letter in an 8 character text
        }
        const { rows } = await c.query('SELECT c, tmp_is_valid_barcode(c) AS v FROM unnest($1::text[]) AS c', [samples]);
        expect(rows).toHaveLength(samples.length);
        for (const r of rows) expect(r.v).toBe(refValid(r.c));
      });
    });

    it('generated codes are valid EAN-13 and pass the validity function', async () => {
      await withHelpers(async (c) => {
        const { rows } = await c.query('SELECT tmp_generated_barcode() AS code, tmp_is_valid_barcode(tmp_generated_barcode()) AS v FROM generate_series(1, 300)');
        for (const r of rows) {
          expect(r.code).toMatch(/^29\d{11}$/);
          expect(isValidEan13(r.code)).toBe(true);
          expect(r.v).toBe(true);
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
      const p2 = await addProduct(c, { id: pid(2), shop: SHOP_A, barcode: 'abc', name: 'Colisao Dois' });
      const p3 = await addProduct(c, { id: pid(3), shop: SHOP_B, barcode: '12345', name: 'Colisao Tres' });
      // Taken before the run (valid, so they stay): 1111... by an INACTIVE product of shop A; 3333... by a product of shop B only.
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
      await addProduct(c, { id: pid(2), shop: SHOP_B, barcode: 'xyz', name: 'Preso Dois' });
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
      await seed(c);
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

  it('revert: giving the old codes back from the audit restores every original code exactly, and a second run does nothing', async () => {
    await withDb(async (c) => {
      await seed(c);
      const original = (await snapshot(c)).products as Row[];
      await applyMigration(c);
      const notices: string[] = [];
      c.on('notice', (n) => notices.push(String(n.message)));

      await c.query(REVERT_SQL);
      const reverted = (await c.query('SELECT * FROM products ORDER BY id')).rows as Row[];
      expect(reverted.map((r) => [r.id, r.barcode])).toEqual(original.map((r) => [r.id, r.barcode]));
      expect(String(notices.at(-1))).toContain(`${N} code(s) given back, 0 skipped`);
      const { rows: revertEvents } = await c.query(`SELECT * FROM audit_events WHERE actor_id = 'system:revert-0005'`);
      expect(revertEvents).toHaveLength(N);

      const afterRevert = await snapshot(c);
      await c.query(REVERT_SQL);
      expect(await snapshot(c)).toEqual(afterRevert);
      expect(String(notices.at(-1))).toContain(`0 code(s) given back, ${N} skipped`);
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
      // Everything else is back exactly as it was, including the odd ones.
      for (const p of REPLACE_CASES.filter((x) => !['a-sem1', 'a-sem3'].includes(x.key))) {
        expect(await code(ids[p.key])).toBe(p.code);
      }
      expect(String(notices.at(-1))).toContain(`${N - 2} code(s) given back, 2 skipped`);
    });
  });

  it('preview: read only, lists per shop what is replaced with the reason, counts the valid ones by type, and changes nothing', async () => {
    await withDb(async (c) => {
      const ids = await seed(c);
      const before = await snapshot(c);

      await c.query('BEGIN READ ONLY'); // the database itself would refuse any write in the script
      const results = (await c.query(PREVIEW_SQL)) as unknown as { rows: Record<string, unknown>[] }[];
      await c.query('ROLLBACK');

      expect(results).toHaveLength(2);
      const [detail, summary] = results.map((r) => r.rows);

      // Detail: exactly the products to replace, each with its category.
      expect(detail).toHaveLength(N);
      for (const p of REPLACE_CASES) {
        expect(detail.find((r) => r.product_id === ids[p.key])).toMatchObject({
          reason: p.reason, barcode: p.code, active: p.active ?? true, has_sales: !!p.sales, has_stock_movement: !!p.sales,
        });
      }
      for (const p of KEEP_CASES) expect(detail.find((r) => r.product_id === ids[p.key])).toBeUndefined();

      // Summary: REPLACE by shop and reason, KEEP only by valid type.
      const expectedSummary = new Map<string, { products: number; active: number }>();
      for (const p of [...REPLACE_CASES, ...KEEP_CASES]) {
        const action = KEEP_CASES.includes(p) ? 'KEEP' : 'REPLACE';
        const key = `${p.shop}|${action}|${p.reason}`;
        const entry = expectedSummary.get(key) ?? { products: 0, active: 0 };
        entry.products++;
        if (p.active ?? true) entry.active++;
        expectedSummary.set(key, entry);
      }
      expect(summary).toHaveLength(expectedSummary.size);
      for (const r of summary) {
        const expected = expectedSummary.get(`${r.merchant_id}|${r.action}|${r.reason}`)!;
        expect(expected).toBeDefined();
        expect(r).toMatchObject({ products: expected.products, active_products: expected.active, inactive_products: expected.products - expected.active });
      }
      const categories = new Set(summary.filter((r) => r.action === 'REPLACE').map((r) => r.reason));
      expect([...categories].sort()).toEqual([
        'empty or only spaces', 'letters and numbers', 'only digits, invalid size', 'only letters', 'sem-', 'symbol or space',
        'wrong check digit EAN-13', 'wrong check digit EAN-8', 'wrong check digit GTIN-14', 'wrong check digit UPC-A',
      ]);
      expect(summary.filter((r) => r.action === 'KEEP').every((r) => String(r.reason).startsWith('valid '))).toBe(true);

      // What the preview announced is what the migration does.
      expect(await snapshot(c)).toEqual(before);
      await applyMigration(c);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM audit_events`);
      expect(rows[0].n).toBe(detail.length);
      expect(rows[0].n).toBe(summary.filter((r) => r.action === 'REPLACE').reduce((s, r) => s + Number(r.products), 0));
    });
  });
});
