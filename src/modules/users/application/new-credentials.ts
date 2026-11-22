import { InvalidNewPasswordError } from '../domain/errors';

const MIN_PASSWORD_LENGTH = 8; // same rule as the sign-up (register-merchant)
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

/** Form rules for a new password. Throws InvalidNewPasswordError with the text shown to the user. */
export function validateNewPassword(password: string, confirmPassword: string): void {
  if (password !== confirmPassword) throw new InvalidNewPasswordError('As senhas não conferem.');
  if (password.length < MIN_PASSWORD_LENGTH) throw new InvalidNewPasswordError('A senha deve ter no mínimo 8 caracteres.');
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new InvalidNewPasswordError('A senha é longa demais. Use até 72 bytes (letras com acento contam como 2).');
  }
}

/** Form rules for a new PIN (the same 6 digits as the sign-up). Throws InvalidNewPasswordError with the text shown to the user. */
export function validateNewPin(pin: string, confirmPin: string): void {
  if (pin !== confirmPin) throw new InvalidNewPasswordError('Os PINs não conferem.');
  if (!/^\d{6}$/.test(pin)) throw new InvalidNewPasswordError('O PIN deve ter exatamente 6 números.');
}
