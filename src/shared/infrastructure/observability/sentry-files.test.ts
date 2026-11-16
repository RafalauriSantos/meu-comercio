import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSentryOptions } from './sentry-privacy';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('configuração única do Sentry', () => {
  it.each(['sentry.server.config.ts', 'sentry.edge.config.ts'])(
    '%s usa buildSentryOptions do módulo único e não repete o bloco de opções',
    (file) => {
      const src = read(file);
      expect(src).toMatch(/sentry-privacy/);
      expect(src).toMatch(/buildSentryOptions\(/);
      for (const dup of ['dataCollection', 'beforeSend', 'enabled:', 'userInfo', 'httpBodies', 'sendDefaultPii']) {
        expect(src, dup).not.toContain(dup);
      }
    },
  );

  it.each(['sentry.server.config.ts', 'sentry.edge.config.ts'])(
    '%s só chama Sentry.init(options) dentro de if (options)',
    (file) => {
      const src = read(file);
      expect(src).toMatch(/if\s*\(\s*options\s*\)\s*(\{\s*)?Sentry\.init\(\s*options\s*\)/);
      expect(src.match(/Sentry\.init\(/g)).toHaveLength(1);
    },
  );

  it('runtime correto em cada arquivo', () => {
    expect(read('sentry.server.config.ts')).toMatch(/['"]server['"]/);
    expect(read('sentry.edge.config.ts')).toMatch(/['"]edge['"]/);
  });
});

describe('Sentry só no servidor (decisão: o IP do navegador geraria a cidade do cliente no painel)', () => {
  it('src/instrumentation-client.ts não existe', () => {
    expect(existsSync(path.join(root, 'src/instrumentation-client.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'instrumentation-client.ts'))).toBe(false);
  });

  it('SentryRuntime aceita só server e edge', () => {
    expect(read('src/shared/infrastructure/observability/sentry-privacy.ts')).toMatch(
      /export type SentryRuntime = "server" \| "edge";/,
    );
  });

  it('buildSentryOptions não aceita client (checado pelo tsc)', () => {
    // @ts-expect-error 'client' não é mais um runtime válido
    buildSentryOptions(undefined, 'client');
  });

  it('nenhum código do navegador usa o ambiente público do Vercel', () => {
    expect(read('next.config.ts')).not.toContain('NEXT_PUBLIC_VERCEL_ENV');
    expect(read('src/shared/infrastructure/observability/sentry-privacy.ts')).not.toContain('NEXT_PUBLIC_VERCEL_ENV');
  });
});

describe('sem segredos versionados', () => {
  it('.env.example tem NEXT_PUBLIC_SENTRY_DSN= vazio', () => {
    expect(read('.env.example')).toMatch(/^NEXT_PUBLIC_SENTRY_DSN=\s*$/m);
  });

  it('nenhum DSN, token ou SENTRY_AUTH com valor em arquivo do repositório', () => {
    const files = execSync('git ls-files -co --exclude-standard', { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.endsWith('package-lock.json') && !f.endsWith('.test.ts') && !f.startsWith('planilhas/'));
    const bad: string[] = [];
    for (const f of files) {
      let txt = '';
      try {
        txt = read(f);
      } catch {
        continue;
      }
      if (/https:\/\/[0-9a-f]{16,}@[^\s'"]*sentry\.io/i.test(txt)) bad.push(`${f}: DSN`);
      if (/sntrys_|sntryu_/.test(txt)) bad.push(`${f}: token`);
      if (/SENTRY_AUTH_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9]/.test(txt)) bad.push(`${f}: SENTRY_AUTH_TOKEN com valor`);
    }
    expect(bad).toEqual([]);
  });
});
