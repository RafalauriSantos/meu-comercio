import { ApiError } from './api-client';

export interface OfflineSaleResponse {
  status: number;
  error?: string;
}

/**
 * Turns the result of sending one queued sale into the response the offline queue understands.
 * Only network failures are rethrown, because those stop the whole queue.
 */
export async function settleOfflineSale(send: () => Promise<unknown>): Promise<OfflineSaleResponse> {
  try {
    await send();
    return { status: 201 };
  } catch (err) {
    if (!(err instanceof ApiError)) {
      throw err;
    }
    // The server already recorded this sale: it is synced.
    if (err.code === 'DUPLICATE_SALE') {
      return { status: 409, error: err.message };
    }
    // Any other 409 (for example a closed cash session) is NOT "already synced".
    // The queue treats 409 as synced and would drop the sale, so report it as a rejection.
    const status = err.status === 409 ? 422 : err.status;
    return { status, error: err.message };
  }
}
