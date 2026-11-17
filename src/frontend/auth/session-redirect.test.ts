import { describe, it, expect, vi } from 'vitest';
import { SESSION_REDIRECT_DELAY_MS, createOnce } from './session-redirect';

describe('session redirect', () => {
  it('waits a few seconds before sending to the login', () => {
    expect(SESSION_REDIRECT_DELAY_MS).toBeGreaterThanOrEqual(2000);
    expect(SESSION_REDIRECT_DELAY_MS).toBeLessThanOrEqual(5000);
  });

  it('runs the redirect once, even if the button and the timer both fire', () => {
    const go = vi.fn();
    const once = createOnce(go);
    once();
    once();
    once();
    expect(go).toHaveBeenCalledTimes(1);
  });
});
