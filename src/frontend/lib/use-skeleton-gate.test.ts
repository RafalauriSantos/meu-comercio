import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// There is no DOM in these tests, so React is replaced by a tiny harness: state and refs live in slots that
// survive between renders, and effects run after each render only when their dependencies changed, with the
// previous cleanup called first. `useSyncExternalStore` answers with the server snapshot while `hydrating`
// is true (full page load: server render and hydration) and with the client snapshot otherwise (navigation
// inside the app, or any render after hydration).
type Slot = { value?: unknown; ref?: { current: unknown }; deps?: unknown[]; cleanup?: void | (() => void) };
const slots: Slot[] = [];
let index = 0;
let pending: Array<{ slot: Slot; effect: () => void | (() => void); deps?: unknown[] }> = [];
let rerender: () => void = () => {};
let hydrating = false;

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const slot = (slots[index] ??= { value: typeof initial === 'function' ? (initial as () => unknown)() : initial });
    index++;
    const set = (next: unknown) => {
      if (Object.is(slot.value, next)) return;
      slot.value = next;
      rerender();
    };
    return [slot.value, set];
  },
  useRef: (initial: unknown) => {
    const slot = (slots[index] ??= { ref: { current: initial } });
    index++;
    return slot.ref;
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const slot = (slots[index] ??= {});
    index++;
    pending.push({ slot, effect, deps });
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown, getServerSnapshot?: () => unknown) => {
    slots[index] ??= {};
    index++;
    return hydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot();
  },
}));

import * as gateModule from './use-skeleton-gate';
import { SKELETON_DELAY_MS, useSkeletonGate } from './use-skeleton-gate';

const D = 150;

let result: string;
let currentLoading: boolean;
let currentDelay: number | undefined;

function render(loading: boolean, delayMs?: number) {
  currentLoading = loading;
  currentDelay = delayMs ?? currentDelay;
  index = 0;
  pending = [];
  // The harness stands in for a component, so calling the hook here is intended.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  result = useSkeletonGate(loading, currentDelay);
  for (const { slot, effect, deps } of pending) {
    const changed = !slot.deps || !deps || deps.some((d, i) => !Object.is(d, slot.deps![i]));
    if (!changed) continue;
    if (typeof slot.cleanup === 'function') slot.cleanup();
    slot.deps = deps;
    slot.cleanup = effect();
  }
}

function unmount() {
  for (const slot of slots) if (typeof slot.cleanup === 'function') slot.cleanup();
}

describe('useSkeletonGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    slots.length = 0;
    currentDelay = undefined;
    hydrating = false;
    rerender = () => {
      // Re-renders after the first one happen once hydration is over.
      hydrating = false;
      render(currentLoading);
    };
  });
  afterEach(() => {
    unmount();
    vi.useRealTimers();
  });

  describe('the delay constant', () => {
    it('exports D as 150 ms and has no minimum time', () => {
      expect(SKELETON_DELAY_MS).toBe(D);
      expect('SKELETON_MIN_MS' in gateModule).toBe(false);
    });

    it('uses the exported constant when no delay is given', () => {
      render(true);
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
      expect(result).toBe('wait');
      vi.advanceTimersByTime(1);
      expect(result).toBe('skeleton');
    });

    it('accepts a custom delay, and keeps the skeleton while the data never arrives', () => {
      render(true, 50);
      vi.advanceTimersByTime(49);
      expect(result).toBe('wait');
      vi.advanceTimersByTime(1);
      expect(result).toBe('skeleton');
      vi.advanceTimersByTime(60_000);

      expect(result).toBe('skeleton');
    });
  });

  describe('navigation inside the app (client render only)', () => {
    it('reserves the space (wait) until D, then shows the skeleton at D', () => {
      render(true);
      expect(result).toBe('wait');
      vi.advanceTimersByTime(D - 1);
      expect(result).toBe('wait');
      vi.advanceTimersByTime(1);

      expect(result).toBe('skeleton');
    });

    it('never shows the skeleton when the data arrives before D', () => {
      const seen: string[] = [];
      render(true);
      vi.advanceTimersByTime(D - 1);
      render(false);
      seen.push(result);
      for (let t = 0; t < 1000; t++) {
        vi.advanceTimersByTime(1);
        seen.push(result);
      }

      expect(seen).not.toContain('skeleton');
      expect(seen).not.toContain('wait');
      expect(new Set(seen)).toEqual(new Set(['content']));
    });

    it('is content in the very render where loading becomes false, with no clock advance and no empty frame', () => {
      render(true);
      render(false);

      expect(result).toBe('content');
    });

    it('goes to content in the same render where loading drops after D, with no minimum time', () => {
      render(true);
      vi.advanceTimersByTime(D + 10);
      expect(result).toBe('skeleton');
      render(false);
      expect(result).toBe('content');

      for (const ms of [0, 1, 10, 399, 400, 5000]) {
        vi.advanceTimersByTime(ms);
        expect(result).toBe('content');
      }
    });

    it('is content on the first render when loading is already false', () => {
      render(false);
      expect(result).toBe('content');
      vi.advanceTimersByTime(5000);

      expect(result).toBe('content');
    });
  });

  describe('first load of the page (server snapshot)', () => {
    it('is skeleton on the first render, without waiting for D', () => {
      hydrating = true;
      render(true);

      expect(result).toBe('skeleton');
    });

    it('stays skeleton after hydration and the first effects, then becomes content when loading drops', () => {
      hydrating = true;
      render(true);
      hydrating = false;
      render(true);
      expect(result).toBe('skeleton');
      vi.advanceTimersByTime(D * 10);
      expect(result).toBe('skeleton');
      render(false);

      expect(result).toBe('content');
    });

    it('does not fall back to wait on a re-render after hydration', () => {
      hydrating = true;
      render(true);
      hydrating = false;
      for (let i = 0; i < 3; i++) {
        render(true);
        expect(result).toBe('skeleton');
      }
    });

    it('is content when loading is already false on the first render', () => {
      hydrating = true;
      render(false);

      expect(result).toBe('content');
    });
  });

  describe('timers and the clock', () => {
    it('leaves no timer behind after unmount: data before D, data after D, and data that never comes', () => {
      render(true);
      vi.advanceTimersByTime(D - 1);
      render(false);
      unmount();
      expect(vi.getTimerCount()).toBe(0);

      slots.length = 0;
      render(true);
      vi.advanceTimersByTime(D + 1);
      render(false);
      unmount();
      expect(vi.getTimerCount()).toBe(0);

      slots.length = 0;
      render(true);
      vi.advanceTimersByTime(D - 1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('has no timer pending once loading is false (nothing to wait for)', () => {
      render(true);
      vi.advanceTimersByTime(D + 1);
      render(false);

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not read the clock (cacheComponents breaks the build on Date.now in render)', () => {
      const now = vi.spyOn(Date, 'now');
      render(true);
      vi.advanceTimersByTime(D + 1);
      render(false);
      vi.advanceTimersByTime(1000);

      expect(now).not.toHaveBeenCalled();
      now.mockRestore();
    });
  });
});
