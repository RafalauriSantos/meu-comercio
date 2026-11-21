export interface OwnerEmailRecord {
  merchantId: string;
  email: string | null;
  verifiedAt: Date | null;
}

export interface OwnerEmailRepository {
  getEmail(username: string): Promise<OwnerEmailRecord | null>;
  /** True when another account already has this e-mail verified. */
  isVerifiedByAnother(email: string, username: string): Promise<boolean>;
  setUnverifiedEmail(username: string, email: string): Promise<void>;
  /** Stores the new e-mail as unverified and returns what was there before. */
  changeEmail(username: string, email: string): Promise<{ previousEmail: string | null; previousVerified: boolean }>;
  /**
   * In one transaction: uses the EMAIL_VERIFICATION link and marks the e-mail verified. Returns null when the
   * link is not valid (including an e-mail that changed after the link was issued). Throws EmailInUseError
   * when another account verified the e-mail first; the link is then NOT used.
   */
  confirmVerification(
    tokenHash: string,
    now: Date
  ): Promise<{ merchantId: string; username: string; email: string } | null>;
}
