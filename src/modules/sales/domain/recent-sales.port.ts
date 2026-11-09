// The sales a person can pick to cancel at the counter: the confirmed ones of the day, newest first.

export interface RecentSale {
  id: string;
  createdAt: Date;
  /** Decimal text, e.g. "59.75". */
  total: string;
  operatorId: string;
  /** The names of the products sold, joined: "Arroz 5kg, Feijão 1kg". */
  items: string;
}

export interface RecentSalesReader {
  /** The confirmed sales made from `start` (included) to `end` (not included), newest first. */
  listConfirmed(merchantId: string, start: Date, end: Date, limit: number): Promise<RecentSale[]>;
}
