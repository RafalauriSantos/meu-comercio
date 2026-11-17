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

  it('peek shows the key without creating one', () => {
    const store = createCheckoutKeyStore(() => 'key-1');
    expect(store.peek()).toBeNull();
    store.current();
    expect(store.peek()).toBe('key-1');
  });

  it('adopt makes a saved key the current one, so a resend does not record the sale twice', () => {
    const store = createCheckoutKeyStore(() => 'new');
    store.adopt('saved');
    expect(store.current()).toBe('saved');
    store.reset();
    expect(store.peek()).toBeNull();
  });
});
