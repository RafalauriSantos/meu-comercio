import { REPORT_TIME_ZONE, resolvePeriod } from '@/modules/reports/domain/report-period';
import type { RecentSalesReader } from '../domain/recent-sales.port';

export const RECENT_SALES_LIMIT = 30;

export interface RecentSaleSummary {
  id: string;
  /** The first 8 characters of the id: what the printed receipt shows. */
  shortId: string;
  createdAt: string;
  total: string;
  operatorId: string;
  items: string;
}

/** The confirmed sales of today (the day in Brasília), newest first, for the person at the counter to pick one. */
export class ListRecentSalesUseCase {
  constructor(
    private readonly reader: RecentSalesReader,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async execute(merchantId: string): Promise<RecentSaleSummary[]> {
    const today = resolvePeriod('today', this.clock(), { timeZone: REPORT_TIME_ZONE });
    const sales = await this.reader.listConfirmed(merchantId, today.start, today.end, RECENT_SALES_LIMIT);

    return sales.map((sale) => ({
      id: sale.id,
      shortId: sale.id.slice(0, 8),
      createdAt: sale.createdAt.toISOString(),
      total: sale.total,
      operatorId: sale.operatorId,
      items: sale.items,
    }));
  }
}
