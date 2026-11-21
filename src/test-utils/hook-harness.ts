// Test helper (never imported by the app). There is no DOM and no testing-library here, so a React hook is
// run by a small stand-in for React's hooks: state and refs live in slots by call order, effects run after
// each render when their dependencies changed, and a setState renders again at once.
//
//   vi.mock('react', async (importOriginal) => {
//     const { fakeHooks } = await import('@/test-utils/hook-harness');
//     const actual = await importOriginal<typeof import('react')>();
//     return { ...actual, ...fakeHooks, default: { ...actual, ...fakeHooks } };
//   });
//   const hook = mountHook(() => useThing(), { strict: true });
//   hook.current().doSomething();
//
// `strict: true` runs every effect, its cleanup and the effect again right after the mount, like React
// Strict Mode does in development.

type Slot = {
  value?: unknown;
  set?: (next: unknown) => void;
  ref?: { current: unknown };
  deps?: unknown[];
  cleanup?: void | (() => void);
  memo?: unknown;
};
type Pending = { slot: Slot; effect: () => void | (() => void); deps?: unknown[] };

const slots: Slot[] = [];
let index = 0;
let pending: Pending[] = [];
let rerender: () => void = () => {};
const slotAt = () => (slots[index] ??= {});

const depsChanged = (next: unknown[], prev?: unknown[]) =>
  !prev || prev.length !== next.length || next.some((d, i) => !Object.is(d, prev[i]));

export const fakeHooks = {
  useState: (initial: unknown) => {
    const slot = slotAt();
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    index++;
    slot.set ??= (next) => {
      const value = typeof next === 'function' ? (next as (p: unknown) => unknown)(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      rerender();
    };
    return [slot.value, slot.set];
  },
  useRef: (initial: unknown) => {
    const slot = slotAt();
    slot.ref ??= { current: initial };
    index++;
    return slot.ref;
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    pending.push({ slot: slotAt(), effect, deps });
    index++;
  },
  useCallback: (fn: unknown, deps: unknown[]) => {
    const slot = slotAt();
    index++;
    if (depsChanged(deps, slot.deps)) {
      slot.deps = deps;
      slot.memo = fn;
    }
    return slot.memo;
  },
};

export function mountHook<T>(hook: () => T, { strict = false }: { strict?: boolean } = {}) {
  slots.length = 0;
  let result!: T;
  let rendering = false;
  let dirty = false;

  const render = () => {
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    try {
      do {
        dirty = false;
        index = 0;
        pending = [];
        result = hook();
        for (const { slot, effect, deps } of pending) {
          if (deps && !depsChanged(deps, slot.deps)) continue;
          slot.cleanup?.();
          slot.deps = deps;
          slot.cleanup = effect();
        }
      } while (dirty);
    } finally {
      rendering = false;
    }
  };

  rerender = render;
  render();
  if (strict) {
    for (const slot of slots) slot.cleanup?.();
    for (const { slot, effect } of pending) slot.cleanup = effect();
  }

  return {
    current: () => result,
    unmount: () => slots.forEach((slot) => slot.cleanup?.()),
  };
}
