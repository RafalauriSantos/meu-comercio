import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter';

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter({
      windowMs: 60_000, // 1 minute
      maxRequests: 5,
    });
  });

  it('should allow requests within the limit', () => {
    const baseTime = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      const result = limiter.check('client-ip-1', baseTime + i * 100);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i);
    }
  });

  it('should block requests exceeding the max limit within the window', () => {
    const baseTime = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      limiter.check('client-ip-1', baseTime + i * 100);
    }

    const blocked = limiter.check('client-ip-1', baseTime + 600);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should isolate limits between different client identifiers', () => {
    const baseTime = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      limiter.check('client-ip-1', baseTime + i * 100);
    }

    // client-ip-1 is blocked
    expect(limiter.check('client-ip-1', baseTime + 600).allowed).toBe(false);

    // client-ip-2 is fresh and allowed
    const freshClient = limiter.check('client-ip-2', baseTime + 600);
    expect(freshClient.allowed).toBe(true);
    expect(freshClient.remaining).toBe(4);
  });

  it('should allow requests again once the sliding window has passed', () => {
    const baseTime = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      limiter.check('client-ip-1', baseTime + i * 100);
    }

    // 60.1 seconds later, the old requests have expired
    const afterWindow = limiter.check('client-ip-1', baseTime + 61_000);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(4);
  });

  it('should reset limits when explicitly cleared', () => {
    const baseTime = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      limiter.check('client-ip-1', baseTime);
    }
    expect(limiter.check('client-ip-1', baseTime).allowed).toBe(false);

    limiter.reset('client-ip-1');
    expect(limiter.check('client-ip-1', baseTime).allowed).toBe(true);
  });
});
