import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const MOD = './sentry-privacy';
const load = async (): Promise<Any> => import(/* @vite-ignore */ MOD);
const scrub = async (event: object): Promise<Any> => (await load()).scrubEvent(event);
const dump = (v: unknown) => JSON.stringify(v);
const DSN = 'https://pub@o0.ingest.sentry.io/1';

afterEach(() => vi.unstubAllEnvs());

describe('caminho: segmentos livres, codificação, credenciais, porta', () => {
  it.each([
    ['/api/products/barcode/Maria%20Souza', '/api/products/barcode/[param]', ['Maria', 'Souza']],
    ['/api/customers/search/maria', '/api/customers/search/[param]', ['maria']],
    ['/api/products/barcode/7891000100103', '/api/products/barcode/:id', ['7891000100103']],
    ['/api/sales/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/cancel', '/api/sales/:id/cancel', ['9b1deb4d']],
    ['/x/%2540', '/[param]/[param]', ['%40', '@']],
    ['D:\\Users\\Maria\\x', '[param]', ['Maria']],
  ])('%s', async (p, expected, leaks) => {
    const r = await scrub({ transaction: p, request: { method: 'GET', url: p } });
    expect(r.transaction).toBe(expected);
    for (const l of leaks) expect(dump(r), l).not.toContain(l);
  });

  it.each([
    ['https://u:p@ss@app.meucomercio.com:8443/vendas?x=1', 'https://app.meucomercio.com/vendas'],
    ['//user:senha@app.meucomercio.com/vendas', '//app.meucomercio.com/vendas'],
    ['//user:pa/ss@host/vendas', '//[host]/[param]/vendas'],
    ['https://app.meucomercio.com:3000', 'https://app.meucomercio.com'],
  ])('url %s', async (u, expected) => {
    const r = await scrub({ request: { url: u } });
    expect(r.request.url).toBe(expected);
    for (const l of ['senha', 'ss@', 'pa/', ':p', '8443']) expect(dump(r), l).not.toContain(l);
  });

  it('descrição de span "GET /caminho" mantém o método e limpa o caminho', async () => {
    const { scrubSpan } = await load();
    expect(scrubSpan({ description: 'GET /api/products/barcode/Maria' }).description).toBe('GET /api/products/barcode/[param]');
  });

  it('idempotente com texto codificado', async () => {
    const e = {
      transaction: '/api/products/barcode/Maria%20Souza%2540',
      request: { method: 'GET', url: 'https://a:b@x.com:81/api/%2540/joao%2540x.com?q=1' },
      exception: { values: [{ type: 'Error', value: 'x', stacktrace: { frames: [{ filename: 'D:\\u\\a%2540.ts' }] } }] },
    };
    const { scrubEvent } = await load();
    const once = scrubEvent(e);
    expect(scrubEvent(once)).toEqual(once);
  });
});

describe('texto: limite de tamanho (ReDoS)', () => {
  it('64 KB sem espaço nem @ leva < 200 ms em scrubLog', async () => {
    const { scrubLog } = await load();
    const big = 'a'.repeat(64 * 1024);
    const t0 = performance.now();
    scrubLog({ level: 'error', message: big });
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('campos do topo e tipo', () => {
  it('objetos, espaços e @ viram ausentes', async () => {
    const r = await scrub({
      event_id: { a: 'João' },
      level: 'error João',
      platform: ['node'],
      release: 'joao@email.com',
      dist: 'x y',
      environment: 'production',
      type: 123456789,
      timestamp: { v: 1 },
    });
    expect(r.environment).toBe('production');
    for (const k of ['event_id', 'level', 'platform', 'release', 'dist', 'type', 'timestamp']) expect(r, k).not.toHaveProperty(k);
  });

  it('type com 6+ dígitos vira Error; classe permitida com mensagem custom perde a mensagem', async () => {
    const r = await scrub({
      exception: {
        values: [
          { type: 'Err12345678', value: 'x' },
          { type: 'InvalidOwnerPinError', value: 'PIN 1234 de Maria' },
        ],
      },
    });
    expect(r.exception.values[0].type).toBe('Error');
    expect(r.exception.values[1].type).toBe('InvalidOwnerPinError');
    expect(dump(r)).not.toContain('Maria');
  });
});

describe('frames', () => {
  const fr = async (f: object) => (await scrub({ exception: { values: [{ type: 'Error', stacktrace: { frames: [f] } }] } })).exception.values[0].stacktrace.frames[0];

  it.each([
    ['D:\\clientes\\Maria Souza\\app.ts', 'app.ts'],
    ['\\\\server\\share\\Maria\\app.ts', 'app.ts'],
    ['file:///C:/Maria/app.ts', 'app.ts'],
    ['blob:https://x.com/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', '[id]'],
    ['/var/task/.next/server/a.js', '/var/task/.next/server/a.js'],
    ['https://app.meucomercio.com/_next/static/a.js', 'https://app.meucomercio.com/_next/static/a.js'],
  ])('filename %s', async (name, expected) => {
    expect((await fr({ filename: name })).filename).toBe(expected);
  });

  it('function com espaço ou dígitos longos vira [anonymous]', async () => {
    expect((await fr({ function: 'Maria Souza' })).function).toBe('[anonymous]');
    expect((await fr({ function: 'f12345678' })).function).toBe('[anonymous]');
    expect((await fr({ function: 'handler' })).function).toBe('handler');
  });
});

describe('opções', () => {
  it('tracePropagationTargets vazio', async () => {
    expect((await load()).buildSentryOptions(DSN, 'server').tracePropagationTargets).toEqual([]);
  });

  it('server troca Http por uma integração com sessions:false', async () => {
    const { buildSentryOptions } = await load();
    const factory = vi.fn((o: { sessions: boolean }) => ({ name: 'Http', o }));
    const integ = buildSentryOptions(DSN, 'server', factory).integrations([{ name: 'Http' }, { name: 'NodeFetch' }]);
    expect(factory).toHaveBeenCalledWith({ sessions: false });
    expect(integ.filter((i: Any) => i.name === 'Http')).toEqual([{ name: 'Http', o: { sessions: false } }]);
    expect(integ.map((i: Any) => i.name)).toContain('NodeFetch');
  });

  it('sentry.server.config passa Sentry.httpIntegration', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(`${process.cwd()}/sentry.server.config.ts`, 'utf8');
    expect(src).toMatch(/"server",\s*Sentry\.httpIntegration\)/);
  });

  it.each(['preview', 'development'])('VERCEL_ENV=%s nunca envia', async (env) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', env);
    const o = (await load()).buildSentryOptions(DSN, 'edge');
    expect(o.enabled).toBe(false);
    expect(o.environment).toBe(env);
  });

  it.each([undefined, ''])('VERCEL_ENV ausente (%j) não envia', async (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', value);
    expect((await load()).buildSentryOptions(DSN, 'server').enabled).toBe(false);
  });
});
