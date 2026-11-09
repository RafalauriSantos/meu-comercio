import type { SalesReport } from '@/frontend/lib/api-client';
import { formatQuantity } from '@/shared/domain/product-unit';

// What the sales report screen shows and exports, worked out from the report the API sends. Money comes as
// text with two decimals ("250.50") and stays text: nothing here adds amounts up.

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
] as const;

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT_CARD: 'Débito',
  CREDIT_CARD: 'Crédito',
  TAB: 'Fiado',
};

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

/** "250.50" -> "250,50" (the decimal comma of Excel in Portuguese). */
export function decimalComma(amount: string): string {
  return amount.replace('.', ',');
}

/** "+25,3%", "-16,7%", "0%", or "—" when there is nothing to compare. */
export function formatPercent(percent: number | null): string {
  if (percent === null) return '—';
  const text = String(Math.abs(percent)).replace('.', ',');
  if (percent > 0) return `+${text}%`;
  if (percent < 0) return `-${text}%`;
  return '0%';
}

export type ChangeDirection = 'up' | 'down' | 'same';

export function changeDirection(changeAmount: string): ChangeDirection {
  const value = Number(changeAmount);
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'same';
}

/** The width of each day's bar, in percent of the best day (the best day is 100). Days with no sales are 0. */
export function dayBarWidths(days: SalesReport['byDay']): number[] {
  const best = Math.max(0, ...days.map((day) => Number(day.total)));
  if (best <= 0) return days.map(() => 0);
  return days.map((day) => Math.round((Number(day.total) / best) * 100));
}

/** The best and the worst day among the days that had sales, or null when no day had any. */
export function bestAndWorstDays(days: SalesReport['byDay']): { best: string; worst: string } | null {
  const sold = days.filter((day) => day.salesCount > 0);
  if (sold.length === 0) return null;
  const byTotal = [...sold].sort((a, b) => Number(b.total) - Number(a.total));
  return { best: byTotal[0].date, worst: byTotal[byTotal.length - 1].date };
}

/** "09/11 seg" for "2026-11-09". */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .replace('.', '');
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')} ${weekday}`;
}

/** How much of a product was sold: units, or kilograms for a product sold by weight. */
export function formatSoldQuantity(product: SalesReport['topProducts'][number]): string {
  return product.unit === 'KG' ? formatQuantity(product.quantity, 'KG') : `${product.quantity} un`;
}

function csvCell(text: string): string {
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The report as a CSV that Excel in Portuguese opens: semicolons, decimal commas, a byte order mark for the
 * accents. One block per table, separated by a blank line.
 */
export function reportToCsv(report: SalesReport): string {
  const rows: string[][] = [];
  const blank = () => rows.push([]);

  rows.push(['Relatório de vendas', report.period.label]);
  rows.push(['Total vendido', decimalComma(report.summary.total)]);
  rows.push(['Vendas', String(report.summary.salesCount)]);
  rows.push(['Ticket médio', decimalComma(report.summary.averageTicket)]);
  rows.push([
    `Comparação com ${report.previous.label}`,
    decimalComma(report.previous.total),
    decimalComma(report.previous.changeAmount),
    formatPercent(report.previous.changePercent),
  ]);

  blank();
  rows.push(['Forma de pagamento', 'Valor', '% do total', 'Pagamentos']);
  for (const row of report.byPayment) {
    rows.push([paymentLabel(row.method), decimalComma(row.amount), String(row.share).replace('.', ','), String(row.count)]);
  }

  blank();
  rows.push(['Dia', 'Vendas', 'Total']);
  for (const row of report.byDay) rows.push([row.date, String(row.salesCount), decimalComma(row.total)]);

  blank();
  rows.push(['Produto', 'Quantidade vendida', 'Valor']);
  for (const row of report.topProducts) rows.push([row.name, formatSoldQuantity(row), decimalComma(row.amount)]);

  blank();
  rows.push(['Operador', 'Vendas', 'Total', '% do total']);
  for (const row of report.byOperator) {
    rows.push([row.operatorId, String(row.salesCount), decimalComma(row.total), String(row.share).replace('.', ',')]);
  }

  blank();
  rows.push(['Vendas canceladas (fora do total)', String(report.cancelled.count), decimalComma(report.cancelled.total)]);
  rows.push(['Fiado vendido', decimalComma(report.fiado.sold)]);
  rows.push(['Fiado recebido', decimalComma(report.fiado.received)]);

  return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** A file name like "relatorio-vendas-2026-11-09-a-2026-11-15.csv". */
export function reportFileName(report: SalesReport): string {
  const { from, to } = report.period;
  return from === to ? `relatorio-vendas-${from}.csv` : `relatorio-vendas-${from}-a-${to}.csv`;
}
