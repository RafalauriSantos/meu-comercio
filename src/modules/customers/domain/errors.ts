export class CustomerNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Active customer not found: ${identifier}`);
    this.name = 'CustomerNotFoundError';
  }
}

export class CustomerAlreadyExistsError extends Error {
  constructor(phone: string) {
    super(`Customer with phone '${phone}' already exists`);
    this.name = 'CustomerAlreadyExistsError';
  }
}

export class CustomerInactiveError extends Error {
  constructor(customerId: string) {
    super(`Customer '${customerId}' is inactive`);
    this.name = 'CustomerInactiveError';
  }
}

export class CreditLimitExceededError extends Error {
  constructor(message = 'Customer credit limit exceeded') {
    super(message);
    this.name = 'CreditLimitExceededError';
  }
}

export class InvalidOwnerPinError extends Error {
  constructor(message = 'Invalid or unauthorized owner PIN') {
    super(message);
    this.name = 'InvalidOwnerPinError';
  }
}

export class DebtSettlementExceedsBalanceError extends Error {
  constructor(message = 'Payment amount exceeds current customer debt') {
    super(message);
    this.name = 'DebtSettlementExceedsBalanceError';
  }
}

export class NoOpenCashSessionError extends Error {
  constructor(message = 'Cannot settle customer debt without an active open cash session') {
    super(message);
    this.name = 'NoOpenCashSessionError';
  }
}

/** The customer was changed by someone else after the caller read it. */
export class CustomerChangedError extends Error {
  constructor() {
    super('Este cliente foi alterado por outra pessoa. Recarregue a página para ver os dados atuais e tente de novo.');
    this.name = 'CustomerChangedError';
  }
}

export class InvalidPhoneError extends Error {
  constructor(message = 'Telefone inválido. Use o DDD e o número, com 8 ou 9 dígitos.') {
    super(message);
    this.name = 'InvalidPhoneError';
  }
}
