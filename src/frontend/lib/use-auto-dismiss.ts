import { useEffect } from 'react';

/** How long a notice stays on screen before it goes away on its own. */
export const NOTICE_DURATION_MS = 2000;

/**
 * Clears a notice after `NOTICE_DURATION_MS`. A new notice (a new value) restarts the time, so a notice
 * is never cut short by the one before it, and leaving the screen cancels the timer.
 */
export function useAutoDismiss<T>(notice: T | null, clear: () => void, durationMs = NOTICE_DURATION_MS): void {
  useEffect(() => {
    if (notice === null || notice === undefined) return;
    const timer = setTimeout(clear, durationMs);
    return () => clearTimeout(timer);
    // `clear` is a fresh function on every render; the timer must depend on the notice only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice, durationMs]);
}
