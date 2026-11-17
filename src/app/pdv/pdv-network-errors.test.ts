import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// The PDV has no DOM harness: these read the code. A failed first load that is not an expired session stays on
// the screen with a retry button; the cart (state and the saved draft) is not touched by it.
describe('/pdv first load failure (source)', () => {
  const source = readScreenSource('pdv');
  const start = source.indexOf('async function init()');
  const init = source.slice(start, source.indexOf('}, [router, attempt]);', start));

  it('the first load runs on mount and again whenever the retry button adds one to attempt', () => {
    expect(start).toBeGreaterThan(-1);
    expect(init.length).toBeGreaterThan(200); // not vacuous: the end marker was found
    expect(source).toMatch(/\n {4}init\(\);\s*\}, \[router, attempt\]\);/);
  });

  it('shows the error with a Tentar de novo button instead of redirecting, in the three areas of the screen', () => {
    expect(source).toMatch(/<LoadFailureNotice[^>]*what="o PDV"[^>]*reason=\{initError\}[^>]*onRetry=\{retryInit\}/);
    expect(source).toMatch(/loading \? <PdvMainSkeleton shape=\{shape\} \/> : initError \?/);
    expect(source).toMatch(/loading \? <PdvSideSkeleton shape=\{shape\} \/> : initError \? null/);
    expect(source).toMatch(/loading \? <PdvStatusSkeleton shape=\{shape\} \/> : initError \? null/);
  });

  it('the retry clears the error and loads again, and never touches the cart', () => {
    const body = source.slice(source.indexOf('function retryInit'), source.indexOf('function retryInit') + 250);
    expect(body).toContain('setInitError(null)');
    expect(body).toContain('setLoading(true)');
    expect(body).toContain('setAttempt((n) => n + 1)');
    expect(body).not.toContain('setCart');
    expect(init).not.toMatch(/setCart\(\[\]\)|clearCartDraft|removeItem/);
  });

  it('a lost connection on a cash sale still saves it offline (the client now throws ApiError, not TypeError)', () => {
    expect(source).toContain('isConnectionError(err)');
    expect(source).not.toContain('err instanceof TypeError');
  });
});
