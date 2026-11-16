import * as Browser from '@sentry/browser';
import * as Nextjs from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 1a volta de correção (code-reviewer). Contrato novo:
 *   scrubEvent(event, hint?) com hint.originalException (+ cadeia .cause) para ler o SQLSTATE;
 *   mensagens: lista de PERMISSÃO (só tipo/classe conhecidos sem dado de usuário mantêm a mensagem);
 *   saída reconstruída por allowlist em todos os níveis (sdk, frames, request, exception, contexts.trace, tags);
 *   buildSentryOptions devolve também beforeSendMetric.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const MOD = './sentry-privacy';
const load = async (): Promise<Any> => import(/* @vite-ignore */ MOD);
const scrub = async (event: object, hint?: object): Promise<Any> => (await load()).scrubEvent(event, hint);
const dump = (v: unknown) => JSON.stringify(v);
const DSN = 'https://pub@o0.ingest.sentry.io/1';

const withException = (type: string, value: string, extra: object = {}) => ({
  exception: { values: [{ type, value, ...extra }] },
});

afterEach(() => vi.unstubAllEnvs());

describe('1. lista de permissão de mensagens (varre o JSON inteiro)', () => {
  const cases: Array<[string, string, string[]]> = [
    ['SyntaxError', `Unexpected token 'J', "João Silva" is not valid JSON`, ['João', 'Silva']],
    ['error', `invalid input syntax for type uuid: "João Silva"`, ['João', 'Silva']],
    ['Error', 'Invalid cents amount: 999', ['999']],
    ['Error', 'Invalid monetary amount: 9.9', ['9.9']],
    ['Error', 'Quantity must be an integer, got 3.', ['got 3']],
    ['Error', 'cpf 123 456 789 09', ['123 456', '789 09']],
    ['Error', 'cpf 123/456/789-09', ['123/456', '789-09']],
    ['Error', 'newPassword: abc123xyz', ['abc123xyz']],
    ['Error', 'currentPassword=abc123xyz', ['abc123xyz']],
    ['Error', 'confirmPassword: abc123xyz', ['abc123xyz']],
    ['Error', 'newPin: 987654', ['987654']],
    ['Error', 'pinHash: $2b$10$abcdefghijk', ['abcdefghijk']],
    ['Error', 'passwordHash: $2b$10$abcdefghijk', ['abcdefghijk']],
    ['Error', 'accessToken: abcdefghijk123', ['abcdefghijk123']],
    ['Error', 'password: minha senha', ['minha senha', 'senha']],
    ['Error', 'cliente Maria Souza nao encontrada', ['Maria', 'Souza']],
    ['Error', 'falha para joao.silva@email.com', ['joao.silva', 'email.com']],
    ['Error', 'ligar para 11 98765 4321', ['98765', '4321']],
    ['CustomerNotFoundError', 'Active customer not found: Maria Souza', ['Maria', 'Souza']],
    ['CustomerAlreadyExistsError', "Customer with phone '11987654321' already exists", ['11987654321']],
    ['CustomerInactiveError', "Customer 'cust-1234' is inactive", ['cust-1234']],
    ['CashSessionNotOpenError', 'Cash session [cs-777] is not open, so the sale cannot be recorded in it.', ['cs-777']],
  ];

  it.each(cases)('exception %s: %s', async (type, value, leaks) => {
    const r = await scrub(withException(type, value));
    const s = dump(r);
    for (const l of leaks) expect(s, l).not.toContain(l);
    expect(r.exception.values[0].type).toBe(type);
  });

  it.each(cases)('event.message e logentry: %s', async (_t, value, leaks) => {
    const r = await scrub({ message: value, logentry: { message: value, params: [value] } });
    const s = dump(r);
    for (const l of leaks) expect(s, l).not.toContain(l);
  });

  it('cadeia exception.values: causa com uuid inválido', async () => {
    const r = await scrub({
      exception: {
        values: [
          { type: 'Error', value: 'wrapper' },
          { type: 'error', value: 'invalid input syntax for type uuid: "João Silva"' },
        ],
      },
    });
    expect(dump(r)).not.toContain('João');
  });

  it('mensagem de tipo desconhecido é descartada ou fixa; tipo e pilha ficam', async () => {
    const r = await scrub(
      withException('WeirdError', 'qualquer texto livre do cliente Zé', {
        stacktrace: { frames: [{ filename: 'app:///src/app/x.ts', function: 'f', lineno: 1 }] },
      }),
    );
    const v = r.exception.values[0];
    expect(v.type).toBe('WeirdError');
    expect(dump(v)).not.toContain('Zé');
    expect(v.stacktrace.frames[0].filename).toBe('app:///src/app/x.ts');
  });
});

describe('2. frames da pilha, mechanism e trace', () => {
  const frame = (f: object) =>
    withException('Error', 'x', { stacktrace: { frames: [{ lineno: 1, in_app: true, ...f }] } });

  it.each([
    [{ filename: 'https://app.meucomercio.com/_next/static/a.js?email=joao@email.com#cpf12345678909' }, ['joao', 'email=', 'cpf1234', '?', '#']],
    [{ filename: 'C:\\Users\\Rafael lauri\\proj\\src\\x.ts' }, ['Rafael', 'lauri']],
    [{ filename: '/home/usuario/proj/src/x.ts' }, ['usuario']],
    [{ filename: '/Users/joaosilva/proj/x.ts' }, ['joaosilva']],
    [{ filename: 'app:///src/joao.silva@email.com.ts' }, ['joao.silva', '@']],
    [{ filename: 'app:///src/123.456.789-09.ts' }, ['123.456.789-09']],
    [{ function: 'handler joao@email.com' }, ['joao@email.com']],
    [{ module: 'C:\\Users\\Rafael lauri\\x' }, ['Rafael']],
    [{ module: 'https://x.com/a?pin=123456#h' }, ['123456', 'pin=']],
    [{ function: 'cpf 123.456.789-09' }, ['123.456.789-09']],
  ])('frame %j sai limpo', async (f, leaks) => {
    const r = await scrub(frame(f));
    const s = dump(r);
    for (const l of leaks) expect(s, l).not.toContain(l);
  });

  it.each([
    { filename: 123, function: { a: 'João Silva' }, module: ['João Silva'] },
    {
      filename: null,
      function: 42,
      module: { x: 'joao@email.com' },
      lineno: 'João Silva',
      colno: { a: 'João' },
      in_app: 'João',
    },
  ])('tipos errados nao quebram nem vazam: %j', async (f) => {
    const r = await scrub(frame(f));
    const s = dump(r);
    expect(s).not.toContain('João');
    expect(s).not.toContain('joao@email.com');
  });

  it('mechanism.type e handled só com valores esperados', async () => {
    const r = await scrub(withException('Error', 'x', { mechanism: { type: 'João Silva', handled: 'João Silva', data: { a: 'João' } } }));
    expect(dump(r)).not.toContain('João');
    const ok = await scrub(
      withException('Error', 'x', { mechanism: { type: 'auto.function.nextjs.on_request_error', handled: false } }),
    );
    expect(ok.exception.values[0].mechanism).toEqual({ type: 'auto.function.nextjs.on_request_error', handled: false });
  });

  it('contexts.trace só com valores esperados', async () => {
    const r = await scrub({
      contexts: {
        trace: {
          trace_id: 'João Silva',
          span_id: 'joao@email.com',
          parent_span_id: '123.456.789-09',
          op: 'João Silva',
          origin: 'joao@email.com',
          status: 'Maria Souza',
        },
      },
    });
    const s = dump(r);
    for (const l of ['João', 'joao@', '123.456', 'Maria']) expect(s, l).not.toContain(l);
  });
});

describe('3. SQLSTATE vem do erro original (hint) e da cadeia cause', () => {
  const sqlEvent = () => withException('Error', 'Failed query: select * from sales where x = $1 params: João Silva');
  const dbErr = () => {
    const root = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    return Object.assign(new Error('Failed query: select * from sales params: João Silva', { cause: root }), {
      code: '23505',
    });
  };

  it('hint.originalException.code e cause.code aparecem; SQL não', async () => {
    const r = await scrub(sqlEvent(), { originalException: dbErr() });
    const s = dump(r);
    expect(s).toContain('Database error (SQLSTATE 23505)');
    expect(s).toContain('40P01');
    for (const bad of ['select', 'João', 'params', 'sales']) expect(s, bad).not.toContain(bad);
  });

  it('SQLSTATE solto no texto, quando é o código, não vira [num]', async () => {
    const r = await scrub(sqlEvent(), { originalException: dbErr() });
    expect(dump(r)).not.toContain('[num]');
    expect(dump(r)).toContain('23505');
  });

  it('sem hint continua limpo', async () => {
    const r = await scrub(sqlEvent());
    const s = dump(r);
    expect(r).not.toBeNull();
    for (const bad of ['select', 'João', 'params', 'sales']) expect(s, bad).not.toContain(bad);
    expect(s).toMatch(/database error/i);
  });

  it('hint hostil (getter que lança) não vaza: descarta ou ignora o hint', async () => {
    const hostile = {};
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('x');
      },
    });
    const r = await scrub(sqlEvent(), { originalException: hostile });
    if (r !== null) expect(dump(r)).not.toContain('João');
  });

  it('cause circular no hint não trava', async () => {
    const e: Any = Object.assign(new Error('Failed query: select 1'), { code: '23505' });
    e.cause = e;
    const r = await scrub(sqlEvent(), { originalException: e });
    expect(r).not.toBeNull();
    expect(dump(r)).toContain('23505');
  });
});

describe('4. sdk e debug_meta', () => {
  it('mantém só name, version e settings.infer_ip', async () => {
    const r = await scrub({
      sdk: {
        name: 'sentry.javascript.nextjs',
        version: '11.12.0',
        integrations: ['João Silva'],
        packages: [{ name: 'npm:@sentry/nextjs', version: '11.12.0' }],
        settings: { infer_ip: 'never', other: 'joao@email.com' },
        extra: 'Maria Souza',
      },
      debug_meta: { images: [{ type: 'sourcemap', code_file: 'C:\\Users\\Rafael lauri\\x.js' }] },
    });
    expect(r.sdk).toEqual({ name: 'sentry.javascript.nextjs', version: '11.12.0', settings: { infer_ip: 'never' } });
    expect(r.debug_meta).toBeUndefined();
  });
});

describe('5. métricas', () => {
  it('beforeSendMetric apaga attributes (ou descarta)', async () => {
    const { buildSentryOptions } = await load();
    const o = buildSentryOptions(DSN, 'server');
    expect(o.beforeSendMetric).toBeTypeOf('function');
    const r = o.beforeSendMetric({ name: 'x', type: 'counter', value: 1, attributes: { email: 'a@b.com', nome: 'João' } });
    if (r !== null) {
      expect(r.attributes ?? {}).toEqual({});
      expect(dump(r)).not.toContain('a@b.com');
    }
  });
});

describe('6. dataCollection completo', () => {
  it.each(['server', 'edge'])('(%s)', async (rt) => {
    const { buildSentryOptions } = await load();
    expect(buildSentryOptions(DSN, rt).dataCollection).toEqual({
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
  });
});

describe('7. transaction e request.url passam por scrubPath e scrubText', () => {
  const dirty = [
    '/clientes/joao@email.com',
    '/clientes/joao%40email.com',
    '/clientes/123.456.789-09',
    '/clientes/12345678909/pin/987654',
  ];
  it.each(dirty)('%s', async (p) => {
    const r = await scrub({ transaction: p, request: { method: 'GET', url: `https://app.meucomercio.com${p}?x=1` } });
    const s = dump(r);
    for (const l of ['joao', 'email.com', '123.456.789-09', '12345678909', '987654', '%40']) expect(s, l).not.toContain(l);
  });
});

describe('8. campos desconhecidos não saem', () => {
  it('topo, request, exception.values, contexts.trace e tags', async () => {
    const r = await scrub({
      level: 'error',
      novoCampoTopo: 'João Silva',
      request: { method: 'GET', url: 'https://app.meucomercio.com/x', novoCampo: 'João Silva', env: { A: 'João Silva' } },
      exception: {
        values: [{ type: 'Error', value: 'x', novoCampo: 'João Silva', mechanism: { type: 'generic', handled: true, novo: 'João Silva' } }],
      },
      contexts: {
        trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), novoCampo: 'João Silva', data: { a: 'João Silva' } },
        novoCtx: { a: 'João Silva' },
      },
      tags: { runtime: 'node', novaTag: 'João Silva' },
      modules: { x: 'João Silva' },
      sdkProcessingMetadata: { a: 'João Silva' },
    });
    expect(dump(r)).not.toContain('João');
  });
});

describe('9. evento hostil: getters que lançam devolvem null', () => {
  const thrower = (obj: Any, key: string) =>
    Object.defineProperty(obj, key, {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });

  it.each([
    ['exception.values', () => ({ exception: thrower({}, 'values') })],
    ['breadcrumbs', () => thrower({ level: 'error' }, 'breadcrumbs')],
    ['frames', () => ({ exception: { values: [{ type: 'Error', stacktrace: thrower({}, 'frames') }] } })],
    ['frame.filename', () => ({ exception: { values: [{ type: 'Error', stacktrace: { frames: [thrower({}, 'filename')] } }] } })],
    ['contexts', () => thrower({ level: 'error' }, 'contexts')],
    ['contexts.trace', () => ({ contexts: thrower({}, 'trace') })],
    ['tags', () => thrower({ level: 'error' }, 'tags')],
    ['extra', () => thrower({ level: 'error' }, 'extra')],
    ['user', () => thrower({ level: 'error' }, 'user')],
    ['sdk', () => thrower({ level: 'error' }, 'sdk')],
  ])('%s', async (_n, make) => {
    expect(await scrub(make())).toBeNull();
  });
});

describe('10. nomes REAIS das integrações do SDK instalado', () => {
  const real = [
    Browser.browserSessionIntegration(),
    Browser.httpContextIntegration(),
    Browser.breadcrumbsIntegration(),
    Browser.consoleIntegration(),
    Browser.browserTracingIntegration(),
    Browser.cultureContextIntegration(),
    Browser.contextLinesIntegration(),
    Nextjs.modulesIntegration(),
    Nextjs.nodeContextIntegration(),
    Nextjs.processSessionIntegration(),
  ];
  const keep = [
    Browser.globalHandlersIntegration(),
    Browser.linkedErrorsIntegration(),
    Browser.dedupeIntegration(),
    Browser.functionToStringIntegration(),
  ];

  it('remove as que coletam dado e mantém as de captura de erro', async () => {
    const { buildSentryOptions } = await load();
    const integ = buildSentryOptions(DSN, 'server').integrations;
    expect(integ).toBeTypeOf('function');
    const names = integ([...real, ...keep]).map((i: { name: string }) => i.name);
    for (const i of real) expect(names, i.name).not.toContain(i.name);
    for (const i of keep) expect(names, i.name).toContain(i.name);
  });
});
