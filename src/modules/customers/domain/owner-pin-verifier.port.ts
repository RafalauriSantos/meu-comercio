export interface OwnerPinVerifier {
  /** Returns true when the PIN belongs to an owner of the merchant. */
  verifyOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<boolean>;
  /** Returns the username of the owner whose PIN matched, or null. */
  authorizeOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<string | null>;
}
