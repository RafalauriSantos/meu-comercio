import { describe, it, expect } from 'vitest';
import { createCheckoutKeyStore } from './checkout-idempotency';

describe('createCheckoutKeyStore', () => {
  it('reuses the same key for retries of the same checkout attempt', () => {
    let n = 0;
    const store = createCheckoutKeyStore(() => `key-${++n}`);

    expect(store.current()).toBe('key-1');
    expect(store.current()).toBe('key-1');
  });

  it('issues a new key only after the sale is completed', () => {
    let n = 0;
    const store = createCheckoutKeyStore(() => `key-${++n}`);
    store.current();

    store.reset();

    expect(store.current()).toBe('key-2');
  });
});
