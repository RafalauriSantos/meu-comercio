import { useEffect, useState } from 'react';

export const RESEND_WAIT_SECONDS = 60;

/** Whole seconds left until `until` (a timestamp in ms; 0 means no wait). Rounded up, never negative. */
export const secondsLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / 1000));

/** The 60 s wait before asking for another link. The server is the one that enforces it; this only tells the person. */
export function useResendCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (until === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  function start() {
    const t = Date.now();
    setNow(t);
    setUntil(t + RESEND_WAIT_SECONDS * 1000);
  }

  return { seconds: secondsLeft(until, now), start };
}
