import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// There is no DOM in these tests, so effects are run by hand: the effect runs at once, and its cleanup is
// kept to be called when the notice changes or the screen goes away.
const cleanups: Array<() => void> = [];
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  },
}));

import { NOTICE_DURATION_MS, useAutoDismiss } from './use-auto-dismiss';

describe('useAutoDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanups.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a notice for 2 seconds and then clears it', () => {
    const clear = vi.fn();

    useAutoDismiss({ text: 'Produto cadastrado com sucesso!' }, clear);

    expect(NOTICE_DURATION_MS).toBe(2000);
    vi.advanceTimersByTime(1999);
    expect(clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('starts nothing when there is no notice', () => {
    const clear = vi.fn();

    useAutoDismiss(null, clear);
    vi.advanceTimersByTime(10_000);

    expect(clear).not.toHaveBeenCalled();
  });

  it('does not let an earlier notice clear a later one', () => {
    const clear = vi.fn();

    useAutoDismiss({ text: 'primeiro' }, clear);
    vi.advanceTimersByTime(1500);
    cleanups.pop()!(); // the notice changed: the effect of the first one is cleaned up
    useAutoDismiss({ text: 'segundo' }, clear);
    vi.advanceTimersByTime(1500);

    expect(clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('cancels the timer when the screen goes away', () => {
    const clear = vi.fn();

    useAutoDismiss({ text: 'x' }, clear);
    cleanups.pop()!();
    vi.advanceTimersByTime(5000);

    expect(clear).not.toHaveBeenCalled();
  });
});

describe('where the notices go away by themselves', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  it('is used for the notices of the management panel, the PDV and the import panel', () => {
    expect(read('src', 'app', 'gestao', 'page.tsx')).toContain('useAutoDismiss(feedback, () => setFeedback(null));');
    expect(read('src', 'app', 'pdv', 'page.tsx')).toContain('useAutoDismiss(message, () => setMessage(null));');
    expect(read('src', 'frontend', 'management', 'import-products-panel.tsx')).toContain(
      'useAutoDismiss(message, () => setMessage(null));'
    );
  });
});
