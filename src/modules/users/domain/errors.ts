export class InvalidEmailError extends Error {
  constructor() {
    super('E-mail inválido');
    this.name = 'InvalidEmailError';
  }
}

export class EmailInUseError extends Error {
  constructor() {
    super('Este e-mail já está em uso');
    this.name = 'EmailInUseError';
  }
}

export class EmailAlreadyVerifiedError extends Error {
  constructor() {
    super('O e-mail desta conta já está confirmado. Para trocar, informe a senha atual.');
    this.name = 'EmailAlreadyVerifiedError';
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super('Senha atual incorreta.');
    this.name = 'InvalidCurrentPasswordError';
  }
}

/** The same message for a used, expired, unknown, tampered or wrong-purpose link (AC-22, AC-35). */
export class InvalidOrExpiredLinkError extends Error {
  constructor() {
    super('Link inválido ou vencido. Peça um novo.');
    this.name = 'InvalidOrExpiredLinkError';
  }
}

export class RecoveryRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      retryAfterSeconds <= 60
        ? `Aguarde ${retryAfterSeconds} segundos para tentar de novo.`
        : `Aguarde ${Math.ceil(retryAfterSeconds / 60)} minutos para tentar de novo.`
    );
    this.name = 'RecoveryRateLimitedError';
  }
}

/** The e-mail could not be sent. `cause` is the EmailDeliveryError; the message never shows technical detail. */
export class EmailSendFailedError extends Error {
  constructor(public readonly cause: unknown) {
    super('Não conseguimos enviar agora. Tente de novo em alguns minutos.');
    this.name = 'EmailSendFailedError';
  }
}

/** The new password is refused (short, different from the repetition, or equal to the current). The message is for the field; the link is not used. */
export class InvalidNewPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNewPasswordError';
  }
}
