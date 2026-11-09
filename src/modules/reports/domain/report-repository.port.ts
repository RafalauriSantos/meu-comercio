import type { ProductUnit } from '@/shared/domain/product-unit';

// What the database answers for one window of time. Money comes as decimal text and is turned into `Money`
// (and rounded to the cent) by the use case, never added up as a JavaScript number.

export interface SalesTotals {
  count: number;
  total: string;
}

export interface PaymentTotal {
  method: string;
  /** How many payments were made with this method. */
  count: number;
  amount: string;
}

export interface DayTotal {
  /** The calendar day in the shop's time zone, "AAAA-MM-DD". */
  date: string;
  count: number;
  total: string;
}

export interface ProductTotal {
  name: string;
  unit: ProductUnit;
  /** Units, or grams for a product sold by weight. */
  quantity: number;
  amount: string;
}

export interface OperatorTotal {
  operatorId: string;
  count: number;
  total: string;
}

export interface SalesWindowData {
  confirmed: SalesTotals;
  cancelled: SalesTotals;
  byPayment: PaymentTotal[];
  byDay: DayTotal[];
  topProducts: ProductTotal[];
  byOperator: OperatorTotal[];
  /** Fiado received in the window: debts settled at the counter (not the refunds of cancelled sales). */
  fiadoReceived: string;
}

export interface ReportRepository {
  /** Everything the report shows for the sales made from `start` (included) to `end` (not included). */
  getSalesWindow(merchantId: string, start: Date, end: Date, timeZone: string): Promise<SalesWindowData>;
  /** Only the number and the total of confirmed sales, to compare with another period. */
  getConfirmedTotals(merchantId: string, start: Date, end: Date): Promise<SalesTotals>;
}
