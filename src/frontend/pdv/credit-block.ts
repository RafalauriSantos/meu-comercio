import { ApiError, type CustomerItem } from '@/frontend/lib/api-client';

// Same text the server sends on the 409, so the screen and the refusal read the same (D-26).
export const CREDIT_BLOCKED_NOTICE = 'Este cliente está com o fiado bloqueado. A venda só pode ser feita à vista.';

/** True when the chosen customer has the fiado blocked (a missing flag counts as not blocked). */
export function creditBlockedCustomer(customers: CustomerItem[], customerId: string): boolean {
  return customers.find((c) => c.id === customerId)?.creditBlocked === true;
}

/** The server refused the fiado because of the block; the message of the error is the one to show. */
export function isCreditBlockedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'CUSTOMER_CREDIT_BLOCKED';
}
