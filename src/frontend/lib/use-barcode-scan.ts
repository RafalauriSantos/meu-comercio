'use client';

import { useEffect, useRef } from 'react';
import { createBarcodeScanDetector, isTextEntryTarget } from '@/frontend/lib/barcode-scan-detector';

/** Calls `onScan` with the code of a barcode reader read outside any text field. The listener lives while the caller is mounted. */
export function useBarcodeScan(onScan: (code: string) => void) {
  // The listener is added once per mount: a new `onScan` on every render must not drop a scan that is half typed.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const detector = createBarcodeScanDetector();
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextEntryTarget(e.target as HTMLElement | null)) return;
      const code = detector.press(e.key, e.timeStamp);
      // The Enter that ends a scan must not also click the focused button.
      if (code) {
        e.preventDefault();
        onScanRef.current(code);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
