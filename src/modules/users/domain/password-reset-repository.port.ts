export interface PasswordResetOwner {
  merchantId: string;
  username: string;
  merchantName: string;
}

export interface OwnerCredentials {
  passwordHash: string;
  email: string | null;
  verifiedAt: Date | null;
}

export interface PasswordResetRepository {
  /** The enabled owner whose CONFIRMED e-mail is this one (AC-14, AC-56). Operators and unconfirmed e-mails never match. */
  findOwnerByVerifiedEmail(email: string): Promise<PasswordResetOwner | null>;
  getCredentials(username: string): Promise<OwnerCredentials | null>;
  /**
   * In one transaction: uses the PASSWORD_RESET link, saves the new hash, sets credentials_changed_at and clears the
   * login counter and lock. Returns null when the link is not valid or the e-mail is no longer the confirmed one.
   * Of two concurrent calls with the same link, exactly one returns data (AC-23).
   */
  resetPassword(params: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<{ merchantId: string; username: string; email: string } | null>;
  /**
   * Same as resetPassword for the PIN_RESET link, and the new authorization PIN hash is saved in the same transaction
   * (AC-29: both or none). The only way to change the PIN: the password always goes with it (AC-28).
   */
  resetPasswordAndPin(params: {
    tokenHash: string;
    passwordHash: string;
    pinHash: string;
    now: Date;
  }): Promise<{ merchantId: string; username: string; email: string } | null>;
}
