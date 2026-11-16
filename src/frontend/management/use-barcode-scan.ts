'use client';

import { useEffect } from 'react';
import { createBarcodeScanDetector, isTextEntryTarget } from '@/frontend/management/barcode-scan-detector';

/** Calls `onScan` with the code of a barcode reader read outside any text field. The listener lives while the caller is mounted. */
export function useBarcodeScan(onScan: (code: string) => void) {
  useEffect(() => {
    const detector = createBarcodeScanDetector();
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextEntryTarget(e.target as HTMLElement | null)) return;
      const code = detector.press(e.key, e.timeStamp);
      // The Enter that ends a scan must not also click the focused button.
      if (code) {
        e.preventDefault();
        onScan(code);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onScan]);
}
