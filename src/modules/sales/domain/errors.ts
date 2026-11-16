export class CashSessionNotOpenError extends Error {
  constructor(public readonly cashSessionId: string) {
    super(`Cash session [${cashSessionId}] is not open, so the sale cannot be recorded in it.`);
    this.name = 'CashSessionNotOpenError';
  }
}

export class SaleAlreadyCancelledError extends Error {
  constructor(message = 'Venda já se encontra cancelada.') {
    super(message);
    this.name = 'SaleAlreadyCancelledError';
  }
}
