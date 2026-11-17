import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { returnFocusTo, createCloseGate, CLOSE_SAFETY_MS } from './use-dialog-panel';

describe('createCloseGate (the panel leaves after its exit animation)', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for the end of the transition: nothing closes before it', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    createCloseGate(done, false);
    vi.advanceTimersByTime(CLOSE_SAFETY_MS - 1);
    expect(done).not.toHaveBeenCalled();
  });

  it('closes when the transition ends, and the late safety timer does not close it twice', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const gate = createCloseGate(done, false);
    gate.transitionEnded();
    expect(done).toHaveBeenCalledTimes(1);
    gate.transitionEnded();
    vi.advanceTimersByTime(CLOSE_SAFETY_MS * 2);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('closes by the safety timer when the transition never ends (browser without support)', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    createCloseGate(done, false);
    vi.advanceTimersByTime(CLOSE_SAFETY_MS);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('keeps the safety time at 400ms, above the 180ms exit', () => {
    expect(CLOSE_SAFETY_MS).toBe(400);
  });

  it('does not close when the panel is reopened while it was closing (cancel)', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const gate = createCloseGate(done, false);
    gate.cancel();
    gate.transitionEnded();
    vi.advanceTimersByTime(CLOSE_SAFETY_MS * 2);
    expect(done).not.toHaveBeenCalled();
  });

  it('with reduced motion closes at once, without waiting for any transition', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    createCloseGate(done, true);
    vi.advanceTimersByTime(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

function fakeElement(isConnected: boolean) {
  const calls: string[] = [];
  return { isConnected, focus: () => calls.push('focus'), calls };
}

describe('returnFocusTo', () => {
  it('focuses the element that opened the panel while it is still on the page', () => {
    const opener = fakeElement(true);
    returnFocusTo(opener as unknown as Element);
    expect(opener.calls).toEqual(['focus']);
  });

  it('does nothing when the element left the page or there was none', () => {
    const gone = fakeElement(false);
    returnFocusTo(gone as unknown as Element);
    expect(gone.calls).toEqual([]);
    expect(() => returnFocusTo(null)).not.toThrow();
  });

  it('ignores something that cannot take focus (no focus method)', () => {
    expect(() => returnFocusTo({ isConnected: true } as unknown as Element)).not.toThrow();
  });
});

// No jsdom: the browser parts of the hook are locked by reading the code.
describe('useDialogPanel (source locks)', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'frontend', 'lib', 'use-dialog-panel.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('remembers the opener, opens as a modal once, and gives the focus back when the panel unmounts', () => {
    expect(source).toMatch(/const opener = document\.activeElement/);
    expect(source).toMatch(/if \(!dialog\.open\) dialog\.showModal\(\)/);
    expect(source).toMatch(/return \(\) => \{[^}]*returnFocusTo\(opener\)/);
  });

  it('gives the focus back only if nobody took it meanwhile (a panel opened in place of this one keeps its own)', () => {
    expect(source).toMatch(/document\.activeElement === document\.body/);
  });

  it('on closing, listens to the transform transition of the dialog itself, cancels the gate on cleanup, and honors reduced motion', () => {
    expect(source).toMatch(/addEventListener\('transitionend'/);
    expect(source).toMatch(/e\.target === dialog && e\.propertyName === 'transform'/);
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
    expect(source).toMatch(/gate\.cancel\(\)/);
  });
});
