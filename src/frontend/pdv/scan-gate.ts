export type ScanScreenState = {
  loading: boolean;
  initError: boolean;
  /** Any window open: payment, PIN, weight, cancel sale, cash operation, receipt. */
  modalOpen: boolean;
};

/** A scan outside the search field goes to the cart only when the sales screen is ready and no window is open. */
export function acceptsScan({ loading, initError, modalOpen }: ScanScreenState): boolean {
  return !loading && !initError && !modalOpen;
}
