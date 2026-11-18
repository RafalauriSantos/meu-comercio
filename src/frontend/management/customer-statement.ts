import { formatMoney } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import type { StatementItem } from '@/frontend/lib/api-client';

export type { StatementItem };

// Pure rules of the customer statement panel (the hook only holds the state and calls the API).
export const STATEMENT_PAGE_SIZE = 20;

const TYPE_LABEL: Record<StatementItem['type'], string> = {
  PURCHASE: 'Compra no fiado',
  PAYMENT: 'Pagamento',
  REVERSAL: 'Estorno por cancelamento',
};

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** dd/mm/yyyy hh:mm in the time of Brasilia, whatever the time zone of the device. */
export function formatStatementDate(iso: string): string {
  const p = Object.fromEntries(DATE_FORMAT.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** What one line shows. A purchase adds debt (plus); a payment or a reversal lowers it (minus). The reason is only for a reversal. */
export function statementRow(item: StatementItem) {
  const debt = item.type === 'PURCHASE';
  return {
    id: item.id,
    label: TYPE_LABEL[item.type],
    sign: debt ? '+' : '−',
    toneClass: debt ? 'mg-stmt-debt' : 'mg-stmt-credit',
    amount: formatMoney(Money.fromDecimal(item.amount)),
    balance: formatMoney(Money.fromDecimal(item.balanceAfter)),
    date: formatStatementDate(item.createdAt),
    operator: item.operator,
    reason: item.type === 'REVERSAL' && item.note ? item.note : null,
  };
}

/** Appends the next page without repeating a line already shown. */
export function mergeStatementItems(current: StatementItem[], incoming: StatementItem[]): StatementItem[] {
  const seen = new Set(current.map((i) => i.id));
  return [...current, ...incoming.filter((i) => !seen.has(i.id) && seen.add(i.id))];
}
