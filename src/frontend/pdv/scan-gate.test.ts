import { describe, it, expect } from 'vitest';
import { acceptsScan } from './scan-gate';

const ready = { loading: false, initError: false, modalOpen: false };

describe('acceptsScan', () => {
  it('accepts a scan on a ready screen with no window open', () => {
    expect(acceptsScan(ready)).toBe(true);
  });

  it('ignores a scan while loading, after a load failure or with any window open', () => {
    expect(acceptsScan({ ...ready, loading: true })).toBe(false);
    expect(acceptsScan({ ...ready, initError: true })).toBe(false);
    expect(acceptsScan({ ...ready, modalOpen: true })).toBe(false);
  });
});
