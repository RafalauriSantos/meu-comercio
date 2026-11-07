/**
 * True once the repeated password is as long as the password and still differs, or longer.
 * Shorter text is still being typed, so it is not flagged.
 */
export function passwordsMismatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && confirm.length >= password.length && password !== confirm;
}
