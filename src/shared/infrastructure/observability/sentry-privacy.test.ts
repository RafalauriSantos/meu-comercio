import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato do módulo único `sentry-privacy.ts` (Spec 21.1 parte 2, PR 2).
 * Exports exigidos:
 *   type SentryRuntime = 'server' | 'edge'
 *   scrubEvent(event, hint?) => event | null   (beforeSend; null = descarta)
 *   scrubTransaction(event) => event | null    (beforeSendTransaction)
 *   scrubSpan(span) => span                    (beforeSendSpan)
 *   scrubLog(log) => log | null                (beforeSendLog)
 *   buildSentryOptions(dsn: string | undefined, runtime: SentryRuntime) => options | null
 */
const MOD = './sentry-privacy';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = async (): Promise<Any> => import(/* @vite-ignore */ MOD);
const scrub = async (event: object): Promise<Any> => (await load()).scrubEvent(event);
const dump = (v: unknown) => JSON.stringify(v);

const STORE = '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d';
const CUSTOMER = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const DSN = 'https://pub@o0.ingest.sentry.io/1';

const SQL_MSG =
  'Failed query: insert into "sales" ("id","customer_name","total") values ($1,$2,$3) params: 12.50,João Silva,joao@email.com';

const baseEvent = () => ({
  event_id: 'abc',
  level: 'error',
  platform: 'node',
  environment: 'production',
  release: '1.2.3',
  server_name: 'ip-10-0-0-1.vercel',
  message: 'boom',
  request: {
    method: 'POST',
    url: `https://app.meucomercio.com/gestao/${STORE}/clientes/${CUSTOMER}?pin=123456&email=a@b.com#x`,
    query_string: 'pin=123456&email=a@b.com',
    data: { ownerPin: '123456', password: 'senha-super-secreta' },
    cookies: { session: 'sess-cookie-value' },
    headers: {
      Authorization: 'Bearer tok-abc-123',
      Cookie: 'session=sess-cookie-value',
      'Set-Cookie': 'session=novo-valor',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://app.meucomercio.com/x?email=a@b.com',
    },
  },
  user: { id: STORE, email: 'dono@loja.com', username: 'dono', ip_address: '1.2.3.4' },
  extra: { total: 'R$ 12,50', customerName: 'João Silva' },
  tags: { merchantId: STORE, customerId: CUSTOMER, saleId: 'sale-1', runtime: 'node' },
  contexts: {
    app: { app_name: 'x' },
    device: { name: 'PC-DO-RAFAEL' },
    os: { name: 'Windows' },
    runtime: { name: 'node' },
    culture: { locale: 'pt-BR' },
    nextjs: { route_type: 'route' },
    customer: { name: 'João Silva' },
  },
  breadcrumbs: [
    { category: 'console', message: SQL_MSG },
    { category: 'fetch', data: { url: `/api/customers/${CUSTOMER}`, status_code: 500 } },
    { category: 'ui.click', message: 'button.pay João Silva' },
    { category: 'navigation', data: { from: `/a/${STORE}`, to: '/b' } },
  ],
  exception: {
    values: [
      {
        type: 'Error',
        value: SQL_MSG,
        stacktrace: {
          frames: [
            {
              filename: 'app:///src/app/api/sales/route.ts',
              lineno: 218,
              pre_context: ['const cpf = "123.456.789-09"'],
              context_line: 'throw e',
              post_context: ['x'],
              vars: { password: 'senha-super-secreta' },
            },
          ],
        },
      },
    ],
  },
});

afterEach(() => vi.unstubAllEnvs());

describe('buildSentryOptions', () => {
  it.each(['server', 'edge'])('sem DSN devolve null (%s)', async (rt) => {
    const { buildSentryOptions } = await load();
    expect(buildSentryOptions(undefined, rt)).toBeNull();
    expect(buildSentryOptions('', rt)).toBeNull();
  });

  it.each(['server', 'edge'])('com DSN falso: privacidade desligada (%s)', async (rt) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { buildSentryOptions } = await load();
    const o = buildSentryOptions(DSN, rt);
    expect(o).not.toBeNull();
    expect(o.dsn).toBe(DSN);
    expect(o.enabled).toBe(true);
    expect(o.sendClientReports).toBe(false);
    expect(o.includeServerName).toBe(false);
    expect(o.maxBreadcrumbs ?? 0).toBe(0);
    expect(o.tracesSampleRate ?? 0).toBe(0);
    expect(o.tracesSampler).toBeUndefined();
    expect(o.profilesSampleRate ?? 0).toBe(0);
    expect(o.replaysSessionSampleRate ?? 0).toBe(0);
    expect(o.replaysOnErrorSampleRate ?? 0).toBe(0);
    expect(o.enableLogs ?? false).toBe(false);
    expect(o.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      frameContextLines: 0,
    });
    expect(o).not.toHaveProperty('sendDefaultPii', true);
    expect(o.beforeSend).toBeTypeOf('function');
    expect(o.beforeSendTransaction).toBeTypeOf('function');
    expect(o.beforeSendSpan).toBeTypeOf('function');
    expect(o.beforeSendLog).toBeTypeOf('function');
  });

  it.each(['development', 'test'])('enabled só em produção (%s)', async (env) => {
    vi.stubEnv('NODE_ENV', env);
    const { buildSentryOptions } = await load();
    expect(buildSentryOptions(DSN, 'server').enabled).toBe(false);
  });

  it('browserSessionIntegration, replay, tracing e breadcrumbs fora das integrações', async () => {
    const { buildSentryOptions } = await load();
    const integ = buildSentryOptions(DSN, 'server').integrations;
    const defaults = ['BrowserSession', 'BrowserTracing', 'Replay', 'HttpContext', 'Breadcrumbs', 'Console', 'GlobalHandlers'];
    const names = (
      typeof integ === 'function' ? integ(defaults.map((name) => ({ name }))) : (integ ?? [])
    ).map((i: { name: string }) => i.name);
    for (const n of ['BrowserSession', 'BrowserTracing', 'Replay', 'HttpContext', 'Breadcrumbs', 'Console']) {
      expect(names).not.toContain(n);
    }
    expect(names).toContain('GlobalHandlers');
  });
});

describe('scrubEvent: estrutura', () => {
  it('apaga corpo, cookies, headers, query e user; mantém método e caminho sem ids', async () => {
    const r = await scrub(baseEvent());
    const s = dump(r);
    for (const secret of [
      '123456', 'senha-super-secreta', 'sess-cookie-value', 'tok-abc-123', 'novo-valor',
      'dono@loja.com', '1.2.3.4', 'a@b.com', 'Mozilla', 'ip-10-0-0-1', STORE, CUSTOMER, 'João', 'PC-DO-RAFAEL',
    ]) {
      expect(s, secret).not.toContain(secret);
    }
    expect(r.request.method).toBe('POST');
    expect(r.request.url).toBe('https://app.meucomercio.com/gestao/:id/clientes/:id');
    expect(r.request.data).toBeUndefined();
    expect(r.request.cookies).toBeUndefined();
    expect(r.request.headers).toBeUndefined();
    expect(r.request.query_string).toBeUndefined();
    expect(r.user).toBeUndefined();
    expect(r.extra).toBeUndefined();
    expect(r.server_name).toBeUndefined();
    expect(r.breadcrumbs ?? []).toEqual([]);
  });

  it('remove contexts de aplicação, SO, máquina e nextjs; mantém release/environment/tipo/pilha', async () => {
    const r = await scrub(baseEvent());
    for (const k of ['app', 'device', 'os', 'culture', 'nextjs', 'customer', 'runtime']) {
      expect(r.contexts?.[k], k).toBeUndefined();
    }
    expect(r.release).toBe('1.2.3');
    expect(r.environment).toBe('production');
    const ex = r.exception.values[0];
    expect(ex.type).toBe('Error');
    expect(ex.stacktrace.frames[0].filename).toBe('app:///src/app/api/sales/route.ts');
    expect(ex.stacktrace.frames[0].lineno).toBe(218);
  });

  it('remove variáveis e linhas de contexto dos frames', async () => {
    const r = await scrub(baseEvent());
    const f = r.exception.values[0].stacktrace.frames[0];
    expect(f.vars).toBeUndefined();
    expect(f.pre_context).toBeUndefined();
    expect(f.post_context).toBeUndefined();
    expect(f.context_line).toBeUndefined();
    expect(dump(r)).not.toContain('123.456.789-09');
  });

  it('tags de negócio (ids) não saem', async () => {
    const r = await scrub(baseEvent());
    const s = dump(r.tags ?? {});
    for (const k of ['merchantId', 'customerId', 'saleId', 'sale-1']) expect(s).not.toContain(k);
  });

  it('URL sem query e sem hash; origem preservada', async () => {
    const r = await scrub({ request: { url: 'https://app.meucomercio.com/vendas?x=1#h', method: 'GET' } });
    expect(r.request.url).toBe('https://app.meucomercio.com/vendas');
  });

  it('é idempotente', async () => {
    const once = await scrub(baseEvent());
    const twice = await scrub(once);
    expect(twice).toEqual(once);
  });
});

describe('scrubEvent: SQL e mensagens', () => {
  const FIXED = /database error/i;

  it('Failed query vira texto fixo em exception, message e logentry', async () => {
    const r = await scrub({
      message: SQL_MSG,
      logentry: { message: SQL_MSG, params: ['joao@email.com'] },
      exception: { values: [{ type: 'Error', value: SQL_MSG }] },
    });
    expect(r.exception.values[0].value).toMatch(FIXED);
    expect(r.message).toMatch(FIXED);
    expect(r.logentry.message).toMatch(FIXED);
    expect(r.logentry.params).toBeUndefined();
    const s = dump(r).toLowerCase();
    for (const bad of ['insert', 'params', 'joão silva', '12.50', 'joao@email.com', 'sales']) {
      expect(s, bad).not.toContain(bad);
    }
  });

  it.each([
    'select * from customers where id = $1',
    'update products set price = 1 where id = 2',
    'delete from sales where id = 1',
    'insert into sales values (1)',
    'something params: 1,2',
  ])('qualquer texto SQL é trocado: %s', async (txt) => {
    const r = await scrub({ exception: { values: [{ type: 'Error', value: txt }] } });
    expect(r.exception.values[0].value).toMatch(FIXED);
  });

  it('preserva SQLSTATE (campo code) e limpa o resto da cadeia', async () => {
    const r = await scrub({
      exception: {
        values: [
          { type: 'Error', value: 'Failed query: select 1 params: 2' },
          { type: 'DatabaseError', value: 'duplicate key value violates unique constraint sales_pkey', code: '23505' },
          { type: 'Error', value: 'Failed query: update x set y=$1 params: Maria Souza', code: '40001' },
        ],
      },
    });
    const s = dump(r);
    expect(s).toContain('23505');
    expect(s).toContain('40001');
    expect(s).not.toContain('Maria Souza');
    expect(s).not.toMatch(/update x/i);
  });

  it('SQLSTATE no texto da mensagem também é preservado', async () => {
    const r = await scrub({
      exception: { values: [{ type: 'Error', value: 'Failed query: insert into t params: 1 (SQLSTATE 23503)' }] },
    });
    expect(r.exception.values[0].value).toContain('23503');
  });

  it('cause aninhada com SQL é limpa', async () => {
    const r = await scrub({
      exception: {
        values: [
          { type: 'Error', value: 'wrapper' },
          { type: 'Error', value: SQL_MSG, mechanism: { data: { cause: SQL_MSG } } },
        ],
      },
      extra: { cause: SQL_MSG },
    });
    expect(dump(r).toLowerCase()).not.toContain('insert into');
    expect(dump(r)).not.toContain('João Silva');
  });
});

describe('scrubEvent: dados proibidos em texto', () => {
  const dirty = [
    'falha para joao.silva@email.com',
    'ligar para (11) 98765-4321',
    'telefone +55 11 98765-4321',
    'cpf 123.456.789-09',
    'cpf 12345678909',
    'ownerPin: 123456',
    '{"pin":"1234"}',
    '{"ownerPin":"12345678","password":"abc123xyz"}',
    'total R$ 1.234,56',
    'saldo 12.50',
    `cliente id ${STORE}`,
    'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
  ];
  const leaks = [
    'joao.silva@email.com', '98765-4321', '123.456.789-09', '12345678909', '123456', '"1234"', '12345678',
    'abc123xyz', '1.234,56', '12.50', STORE, 'eyJhbGci',
  ];

  it.each(dirty)('mensagem não vaza: %s', async (txt) => {
    const r = await scrub({
      message: txt,
      exception: { values: [{ type: 'Error', value: txt }] },
      logentry: { message: txt },
    });
    const s = dump(r);
    for (const l of leaks) expect(s, l).not.toContain(l);
  });

  it('nada sensível em tags, extra, contexts ou breadcrumbs', async () => {
    const r = await scrub({
      tags: { email: 'a@b.com', total: '12.50', pin: '1234' },
      extra: { password: 'abc123xyz', cpf: '123.456.789-09', phone: '11987654321' },
      contexts: { custom: { ownerPin: '123456' } },
      breadcrumbs: [{ message: 'João Silva R$ 12,50' }],
    });
    const s = dump(r);
    for (const l of ['a@b.com', '12.50', 'abc123xyz', '123.456.789-09', '11987654321', '123456', 'João', '12,50']) {
      expect(s, l).not.toContain(l);
    }
  });
});

describe('falha no filtro descarta o evento', () => {
  it('retorna null se o filtro lança (evento hostil)', async () => {
    const hostile = {};
    Object.defineProperty(hostile, 'request', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(await scrub(hostile)).toBeNull();
  });

  it('retorna null com estrutura inesperada', async () => {
    const e: Any = { exception: { values: 'not-an-array' } };
    e.self = e;
    expect(await scrub(e)).toBeNull();
  });
});

describe('scrubTransaction, scrubSpan, scrubLog', () => {
  it('transação é limpa como evento (ou descartada)', async () => {
    const { scrubTransaction } = await load();
    const r = scrubTransaction({ ...baseEvent(), type: 'transaction', transaction: `/api/customers/${CUSTOMER}` });
    const s = dump(r);
    expect(s).not.toContain(CUSTOMER);
    expect(s).not.toContain('senha-super-secreta');
  });

  it('span sem dados sensíveis', async () => {
    const { scrubSpan } = await load();
    const r = scrubSpan({
      description: SQL_MSG,
      data: { 'db.statement': SQL_MSG, 'http.url': `/api/customers/${CUSTOMER}?pin=1234`, 'http.query': 'pin=1234' },
    });
    const s = dump(r);
    expect(s).not.toContain('João Silva');
    expect(s).not.toContain(CUSTOMER);
    expect(s).not.toContain('pin=1234');
    expect(s.toLowerCase()).not.toContain('insert into');
  });

  it('log sem dados sensíveis (ou descartado)', async () => {
    const { scrubLog } = await load();
    const r = scrubLog({ level: 'error', message: SQL_MSG, attributes: { email: { value: 'a@b.com', type: 'string' } } });
    const s = dump(r);
    expect(s).not.toContain('João Silva');
    expect(s).not.toContain('a@b.com');
  });
});

describe('ruído (ignoreErrors/denyUrls)', () => {
  const opts = async () => (await load()).buildSentryOptions(DSN, 'server');
  const matches = (list: Array<string | RegExp>, text: string) =>
    list.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)));

  it.each([
    'AbortError: The operation was aborted',
    'The operation was aborted.',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'ChunkLoadError: Loading chunk 123 failed.',
    'Loading chunk 45 failed',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
    'NEXT_REDIRECT',
    'NEXT_NOT_FOUND',
  ])('ignoreErrors cobre: %s', async (msg) => {
    expect(matches((await opts()).ignoreErrors, msg)).toBe(true);
  });

  it('não ignora erro real', async () => {
    expect(matches((await opts()).ignoreErrors, 'TypeError: x is undefined')).toBe(false);
  });

  it.each([
    'chrome-extension://abcdef/content.js',
    'moz-extension://abcdef/content.js',
    'safari-extension://abcdef/content.js',
  ])('denyUrls cobre %s', async (url) => {
    expect(matches((await opts()).denyUrls, url)).toBe(true);
  });

  it('denyUrls não cobre o próprio app', async () => {
    expect(matches((await opts()).denyUrls, 'https://app.meucomercio.com/_next/static/chunks/a.js')).toBe(false);
  });
});

// PR 4 (ponto de captura nas rotas, não no filtro): erros esperados
// (401, 403, PIN inválido, domínio, 400 Zod, 404, 429) não chamam a captura.
it.todo('PR 4: erro esperado não chama captureException; erro de banco chama');
