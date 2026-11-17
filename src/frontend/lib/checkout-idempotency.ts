/**
 * Keeps one Idempotency-Key per checkout attempt, so a retry after a lost
 * response cannot record the same fiado sale twice. The key is dropped only
 * when the sale is completed.
 */
export function createCheckoutKeyStore(generate: () => string = () => crypto.randomUUID()) {
  let key: string | null = null;
  return {
    current(): string {
      if (key === null) {
        key = generate();
      }
      return key;
    },
    /** The key of the checkout in progress, or null if none started (does not create one). */
    peek(): string | null {
      return key;
    },
    /** Takes back the key saved before the login, so a resend of that checkout is not recorded twice. */
    adopt(saved: string): void {
      key = saved;
    },
    reset(): void {
      key = null;
    },
  };
}
