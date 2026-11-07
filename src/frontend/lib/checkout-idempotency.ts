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
    reset(): void {
      key = null;
    },
  };
}
