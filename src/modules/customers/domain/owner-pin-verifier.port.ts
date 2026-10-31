export interface OwnerPinVerifier {
  verifyOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<boolean>;
}
