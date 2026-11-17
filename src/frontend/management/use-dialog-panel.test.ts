import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { returnFocusTo } from './use-dialog-panel';

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
  const source = readFileSync(join(process.cwd(), 'src', 'frontend', 'management', 'use-dialog-panel.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('remembers the opener, opens as a modal once, and gives the focus back when the panel unmounts', () => {
    expect(source).toMatch(/const opener = document\.activeElement/);
    expect(source).toMatch(/if \(!dialog\.open\) dialog\.showModal\(\)/);
    expect(source).toMatch(/return \(\) => returnFocusTo\(opener\)/);
  });
});
