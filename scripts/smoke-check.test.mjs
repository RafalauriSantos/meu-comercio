import { describe, it, expect, vi } from 'vitest';
import { runSmokeCheck } from './smoke-check.mjs';

const BASE = 'https://meucomercio.example';
const COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';

function response(status, body) {
  return { status, json: async () => body };
}

/** A fake fetch: each path answers from a list, one answer per call (the last one repeats). */
function fakeFetch(answers) {
  const calls = {};
  const fn = vi.fn(async (url) => {
    const path = new URL(url).pathname;
    const list = answers[path];
    const index = Math.min(calls[path] ?? 0, list.length - 1);
    calls[path] = (calls[path] ?? 0) + 1;
    const answer = list[index];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return fn;
}

const options = (fetchFn, extra = {}) => ({
  baseUrl: BASE,
  expectedCommit: COMMIT,
  fetchFn,
  attempts: 3,
  delayMs: 0,
  sleep: async () => {},
  ...extra,
});

describe('runSmokeCheck (21.3)', () => {
  it('passes when /login answers 200 and /api/version shows the commit that just went out', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [response(200, { version: '0.1.0', commit: 'abcdef1' })],
    });

    expect(await runSmokeCheck(options(fetchFn))).toEqual({ ok: true, problems: [] });
  });

  it('only reads the two public pages, with GET', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [response(200, { commit: 'abcdef1' })],
    });

    await runSmokeCheck(options(fetchFn));

    const urls = fetchFn.mock.calls.map(([url]) => new URL(url).pathname).sort();
    expect(urls).toEqual(['/api/version', '/login']);
    for (const [, init] of fetchFn.mock.calls) expect(init?.method ?? 'GET').toBe('GET');
  });

  it('fails when the published version is another commit, after every attempt', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [response(200, { commit: '1111111' })],
    });

    const result = await runSmokeCheck(options(fetchFn));

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('1111111');
    expect(result.problems.join(' ')).toContain('abcdef1');
  });

  it('fails when /login does not answer 200', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(500, null)],
      '/api/version': [response(200, { commit: 'abcdef1' })],
    });

    const result = await runSmokeCheck(options(fetchFn));

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('/login');
    expect(result.problems.join(' ')).toContain('500');
  });

  it('waits for the new version: an old commit on the first attempt is fine if the next one is right', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [response(200, { commit: '1111111' }), response(200, { commit: 'abcdef1' })],
    });

    expect(await runSmokeCheck(options(fetchFn))).toEqual({ ok: true, problems: [] });
  });

  it('treats a network error as a failed attempt, not a crash, and recovers on the next one', async () => {
    const fetchFn = fakeFetch({
      '/login': [new Error('fetch failed'), response(200, null)],
      '/api/version': [response(200, { commit: 'abcdef1' })],
    });

    expect(await runSmokeCheck(options(fetchFn))).toEqual({ ok: true, problems: [] });
  });

  it('fails when /api/version is not JSON', async () => {
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [{ status: 200, json: async () => { throw new Error('not json'); } }],
    });

    const result = await runSmokeCheck(options(fetchFn));

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('/api/version');
  });

  it('stops after the number of attempts, waiting between them', async () => {
    const sleep = vi.fn(async () => {});
    const fetchFn = fakeFetch({
      '/login': [response(200, null)],
      '/api/version': [response(200, { commit: '1111111' })],
    });

    await runSmokeCheck(options(fetchFn, { attempts: 3, delayMs: 5, sleep }));

    expect(fetchFn.mock.calls.filter(([url]) => new URL(url).pathname === '/login')).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
});
