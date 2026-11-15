import { useEffect, useState, useSyncExternalStore } from 'react';

/** How long the data area stays reserved (nothing visible) before the skeleton appears. */
export const SKELETON_DELAY_MS = 150;

export type SkeletonGate = 'wait' | 'skeleton' | 'content';

const noopSubscribe = () => () => {};

/**
 * Decides what the data area of a loading screen shows: `wait` (space reserved, nothing visible) until
 * `delayMs`, then `skeleton`, and `content` as soon as `loading` is false, with no minimum time. On the first
 * page load it starts at `skeleton`, so the HTML from the server already has it. Never reads the clock.
 */
export function useSkeletonGate(loading: boolean, delayMs = SKELETON_DELAY_MS): SkeletonGate {
  // True on the server and while hydrating, false when only the client renders (navigation inside the app).
  const firstLoad = useSyncExternalStore(noopSubscribe, () => false, () => true);
  const [phase, setPhase] = useState<'wait' | 'skeleton'>(firstLoad ? 'skeleton' : 'wait');

  // Still loading after `delayMs`: show the skeleton.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setPhase('skeleton'), delayMs);
    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return loading ? phase : 'content';
}
