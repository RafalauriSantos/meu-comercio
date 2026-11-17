import { describe, it, expect, vi, beforeEach } from 'vitest';

// There is no DOM in these tests: `window` is a small fake, and effects run by hand (at once, cleanup kept).
type Listener = (e: unknown) => void;
const listeners = new Set<Listener>();
const cleanups: Array<() => void> = [];
vi.stubGlobal('window', {
  addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
  removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
});
vi.mock('react', () => ({
  useRef: <T,>(value: T) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  },
}));

import { useBarcodeScan } from './use-barcode-scan';

const body = { tagName: 'BODY' };

function press(key: string, at: number, target: unknown = body) {
  const event = { key, timeStamp: at, target, preventDefault: vi.fn() };
  for (const fn of [...listeners]) fn(event);
  return event;
}

function scan(code: string, start = 1000, target: unknown = body) {
  [...code].forEach((ch, i) => press(ch, start + i * 10, target));
  return press('Enter', start + code.length * 10, target);
}

describe('useBarcodeScan', () => {
  beforeEach(() => {
    listeners.clear();
    cleanups.length = 0;
  });

  it('delivers a scan with the focus outside a text field and keeps Enter from clicking the focused button', () => {
    const onScan = vi.fn();
    useBarcodeScan(onScan);

    const enter = scan('7891000100103', 1000, { tagName: 'BUTTON' });

    expect(onScan).toHaveBeenCalledExactlyOnceWith('7891000100103');
    expect(enter.preventDefault).toHaveBeenCalled();
  });

  it('ignores a scan typed in a text field, so the field keeps its own Enter', () => {
    const onScan = vi.fn();
    useBarcodeScan(onScan);

    scan('7891000100103', 1000, { tagName: 'INPUT', type: 'text' });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores slow human typing followed by Enter', () => {
    const onScan = vi.fn();
    useBarcodeScan(onScan);

    [...'7891000'].forEach((ch, i) => press(ch, 1000 + i * 120));
    const enter = press('Enter', 3000);

    expect(onScan).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('removes the listener when the screen goes away: no scan is delivered afterwards', () => {
    const onScan = vi.fn();
    useBarcodeScan(onScan);
    expect(listeners.size).toBe(1);

    cleanups.forEach((cleanup) => cleanup());
    scan('7891000100103');

    expect(listeners.size).toBe(0);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('gives each screen only its own scan: a screen that left receives nothing from the next one', () => {
    const sales = vi.fn();
    const catalog = vi.fn();
    useBarcodeScan(sales);
    const salesCleanups = cleanups.splice(0);
    salesCleanups.forEach((cleanup) => cleanup());
    useBarcodeScan(catalog);

    scan('7891000100103');

    expect(catalog).toHaveBeenCalledExactlyOnceWith('7891000100103');
    expect(sales).not.toHaveBeenCalled();
    expect(listeners.size).toBe(1);
  });
});
