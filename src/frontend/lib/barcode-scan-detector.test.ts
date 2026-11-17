import { describe, it, expect } from 'vitest';
import { createBarcodeScanDetector, isTextEntryTarget, SCAN_MAX_GAP_MS, SCAN_MIN_LENGTH } from './barcode-scan-detector';

// Feeds keys to the detector with a simulated clock: `gap` ms between one key and the next.
function feed(keys: string[], gap: number) {
  const detector = createBarcodeScanDetector();
  let now = 1000;
  let result: string | null = null;
  for (const key of keys) {
    result = detector.press(key, now);
    now += gap;
  }
  return { detector, result, now };
}

const code = ['7', '8', '9', '1', '2'];

describe('createBarcodeScanDetector', () => {
  it('fires with the code on Enter after a fast burst of characters', () => {
    expect(feed([...code, 'Enter'], 10).result).toBe('78912');
  });

  it('never fires for slow typing', () => {
    expect(feed([...code, 'Enter'], SCAN_MAX_GAP_MS + 1).result).toBeNull();
  });

  it('does not fire when the buffer is shorter than the minimum', () => {
    const short = Array.from({ length: SCAN_MIN_LENGTH - 1 }, () => '1');
    expect(feed([...short, 'Enter'], 10).result).toBeNull();
  });

  it('fires at exactly the minimum length', () => {
    const exact = Array.from({ length: SCAN_MIN_LENGTH }, () => '1');
    expect(feed([...exact, 'Enter'], 10).result).toBe('1'.repeat(SCAN_MIN_LENGTH));
  });

  it('expires the buffer when the burst stops', () => {
    const { detector, now } = feed(code, 10);
    expect(detector.press('Enter', now + SCAN_MAX_GAP_MS + 1)).toBeNull();
  });

  it('does not fire on Enter without a buffer', () => {
    expect(createBarcodeScanDetector().press('Enter', 1000)).toBeNull();
  });

  it('clears the buffer after firing, so a second Enter does not repeat it', () => {
    const { detector, now } = feed([...code, 'Enter'], 10);
    expect(detector.press('Enter', now)).toBeNull();
  });

  it('ignores modifier keys in the middle of a burst', () => {
    expect(feed(['7', 'Shift', '8', '9', '1', 'Enter'], 10).result).toBe('7891');
  });
});

describe('isTextEntryTarget', () => {
  it('is true for text fields, textareas, selects and editable content', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for the page, buttons and checkboxes', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
  });
});
