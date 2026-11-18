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

export class InvalidCreditLimitError extends Error {
  constructor(message = 'O limite de fiado deve ser de R$ 0,00 a R$ 100.000,00.') {
    super(message);
    this.name = 'InvalidCreditLimitError';
  }
}

/** D-29: only the owner sets the credit limit when registering a customer. */
export class OnlyOwnerSetsCreditLimitError extends Error {
  constructor(message = 'Só a proprietária define o limite de fiado.') {
    super(message);
    this.name = 'OnlyOwnerSetsCreditLimitError';
  }
}

/** D-26: the owner blocked this customer's credit; a credit sale is refused even with the owner PIN. */
export class CustomerCreditBlockedError extends Error {
  constructor(message = 'Este cliente está com o fiado bloqueado. A venda só pode ser feita à vista.') {
    super(message);
    this.name = 'CustomerCreditBlockedError';
  }
}

/** D-28: the statement page size is not a whole number between 1 and 50. */
export class InvalidStatementLimitError extends Error {
  constructor(message = 'O limite deve ser um número inteiro entre 1 e 50.') {
    super(message);
    this.name = 'InvalidStatementLimitError';
  }
}

/** D-28: the statement cursor is malformed, tampered with, or belongs to another customer. */
export class InvalidStatementCursorError extends Error {
  constructor(message = 'Cursor do extrato inválido.') {
    super(message);
    this.name = 'InvalidStatementCursorError';
  }
}
