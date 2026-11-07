export class CashSessionNotOpenError extends Error {
  constructor(public readonly cashSessionId: string) {
    super(`Cash session [${cashSessionId}] is not open, so the sale cannot be recorded in it.`);
    this.name = 'CashSessionNotOpenError';
  }
}
