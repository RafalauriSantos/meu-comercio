// A barcode reader acts as a keyboard: the characters arrive very fast and end with Enter.
// Tune here: the largest pause between two keys of the same scan, and the shortest code accepted.
export const SCAN_MAX_GAP_MS = 50;
export const SCAN_MIN_LENGTH = 4;

/** Feed it every key press with its time; `press` returns the scanned code on the Enter that ends a scan, else null. */
export function createBarcodeScanDetector() {
  let buffer = '';
  let lastAt = 0;

  return {
    press(key: string, now: number): string | null {
      if (now - lastAt > SCAN_MAX_GAP_MS) buffer = '';
      lastAt = now;
      if (key === 'Enter') {
        const code = buffer;
        buffer = '';
        return code.length >= SCAN_MIN_LENGTH ? code : null;
      }
      if (key.length === 1) buffer += key;
      return null;
    },
  };
}

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];

/** True when the focus is where the owner types: a scan must then keep its normal effect (search, barcode field). */
export function isTextEntryTarget(target: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.includes(target.type ?? '');
}
