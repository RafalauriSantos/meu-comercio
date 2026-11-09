// The periods of the sales report ("hoje", "esta semana", "este mês"...) and where each one starts and ends.
//
// The day is the day on the wall clock of the shop, not in UTC: a sale made at 22:00 in Brasília is of that
// day even though it is already the next day in UTC. Every boundary below is an instant (a Date) that is
// midnight in the shop's time zone, so the database can compare it with `created_at` directly.

export const REPORT_TIME_ZONE = 'America/Sao_Paulo';

export const PERIOD_KINDS = ['today', 'yesterday', 'week', 'month', 'custom'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** A calendar day as "AAAA-MM-DD". */
export type LocalDate = string;

export const MAX_CUSTOM_DAYS = 366;

export interface ReportPeriod {
  kind: PeriodKind;
  /** First instant of the period (midnight of its first day). */
  start: Date;
  /** First instant after the period (midnight of the day after its last day): the end is not included. */
  end: Date;
  /** First and last day of the period, as calendar days. */
  from: LocalDate;
  to: LocalDate;
  label: string;
  /** The window the report is compared with: the same stretch of time, one period earlier. */
  previous: { start: Date; end: Date; label: string };
}

export class InvalidPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPeriodError';
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  /** 1 = Monday ... 7 = Sunday. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: WEEKDAYS[get('weekday')] };
}

/** How far the wall clock of `timeZone` is ahead of UTC at `instant`, in milliseconds (negative in Brasília). */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** The calendar day `days` after (or before, if negative) the given one. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const parsed = parseLocalDate(date);
  if (!parsed) throw new InvalidPeriodError(`Data inválida: ${date}`);
  const moved = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatLocalDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) throw new InvalidPeriodError('Data inválida.');
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** The instant at which the given calendar day starts in `timeZone`. */
export function startOfLocalDay(date: LocalDate, timeZone: string = REPORT_TIME_ZONE): Date {
  const parsed = parseLocalDate(date);
  if (!parsed) throw new InvalidPeriodError(`Data inválida: ${date}`);
  const wallAsUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  // The offset depends on the instant itself, so settle it with two passes (it only matters where the
  // zone has daylight saving time; Brasília has none since 2019).
  let instant = new Date(wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone));
  instant = new Date(wallAsUtc - offsetMs(instant, timeZone));
  return instant;
}

export function localDateOf(instant: Date, timeZone: string = REPORT_TIME_ZONE): LocalDate {
  const { year, month, day } = zonedParts(instant, timeZone);
  return formatLocalDate(year, month, day);
}

function br(date: LocalDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function brShort(date: LocalDate): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/**
 * Where `kind` starts and ends as of `now`. "Esta semana" runs from Monday and "este mês" from the 1st; both
 * end at the end of their last day, but are compared with the previous week/month over the same elapsed time.
 * A custom period is `from` to `to`, both days included.
 */
export function resolvePeriod(
  kind: PeriodKind,
  now: Date,
  options: { from?: string; to?: string; timeZone?: string } = {}
): ReportPeriod {
  const timeZone = options.timeZone ?? REPORT_TIME_ZONE;
  const parts = zonedParts(now, timeZone);
  const today = formatLocalDate(parts.year, parts.month, parts.day);

  let from: LocalDate;
  let to: LocalDate;
  let label: string;
  let previousFrom: LocalDate;
  let previousLabel: string;

  switch (kind) {
    case 'today':
      from = to = today;
      label = `Hoje, ${br(today)}`;
      previousFrom = addDays(today, -1);
      previousLabel = 'ontem';
      break;
    case 'yesterday':
      from = to = addDays(today, -1);
      label = `Ontem, ${br(from)}`;
      previousFrom = addDays(from, -1);
      previousLabel = 'anteontem';
      break;
    case 'week':
      from = addDays(today, -(parts.weekday - 1));
      to = addDays(from, 6);
      label = `Esta semana, ${brShort(from)} a ${brShort(to)}`;
      previousFrom = addDays(from, -7);
      previousLabel = 'semana passada';
      break;
    case 'month': {
      from = formatLocalDate(parts.year, parts.month, 1);
      const next = parts.month === 12 ? formatLocalDate(parts.year + 1, 1, 1) : formatLocalDate(parts.year, parts.month + 1, 1);
      to = addDays(next, -1);
      label = `Este mês, ${brShort(from)} a ${brShort(to)}`;
      previousFrom = parts.month === 1 ? formatLocalDate(parts.year - 1, 12, 1) : formatLocalDate(parts.year, parts.month - 1, 1);
      previousLabel = 'mês passado';
      break;
    }
    case 'custom': {
      const { from: rawFrom, to: rawTo } = options;
      if (!rawFrom || !rawTo || !parseLocalDate(rawFrom) || !parseLocalDate(rawTo)) {
        throw new InvalidPeriodError('Informe a data inicial e a final, no formato AAAA-MM-DD.');
      }
      if (rawTo < rawFrom) throw new InvalidPeriodError('A data final não pode ser antes da inicial.');
      const length = daysBetween(rawFrom, rawTo) + 1;
      if (length > MAX_CUSTOM_DAYS) {
        throw new InvalidPeriodError(`O período pode ter no máximo ${MAX_CUSTOM_DAYS} dias.`);
      }
      from = rawFrom;
      to = rawTo;
      label = `De ${br(from)} a ${br(to)}`;
      previousFrom = addDays(from, -length);
      previousLabel = 'período anterior';
      break;
    }
  }

  const start = startOfLocalDay(from, timeZone);
  const end = startOfLocalDay(addDays(to, 1), timeZone);

  // Compared over the same elapsed time: if the period is still running, the earlier one is cut at the same point.
  const elapsedEnd = new Date(Math.min(now.getTime(), end.getTime()));
  const span = Math.max(elapsedEnd.getTime() - start.getTime(), 0);
  const previousStart = startOfLocalDay(previousFrom, timeZone);
  const previousFullEnd = start;
  const previousEnd = new Date(Math.min(previousStart.getTime() + span, previousFullEnd.getTime()));

  return {
    kind,
    start,
    end,
    from,
    to,
    label,
    previous: { start: previousStart, end: previousEnd, label: previousLabel },
  };
}

/** Every day from `from` to `to`, both included, as calendar days. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}
