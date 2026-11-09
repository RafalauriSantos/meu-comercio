import { describe, it, expect } from 'vitest';
import {
  InvalidPeriodError,
  addDays,
  eachDay,
  localDateOf,
  parseLocalDate,
  resolvePeriod,
  startOfLocalDay,
} from './report-period';

const iso = (date: Date) => date.toISOString();

// Wednesday, 11 Nov 2026, 12:00 in Brasília (UTC-3).
const NOON = new Date('2026-11-11T15:00:00Z');

describe('startOfLocalDay', () => {
  it('is midnight in Brasília, which is 03:00 UTC', () => {
    expect(iso(startOfLocalDay('2026-11-09'))).toBe('2026-11-09T03:00:00.000Z');
  });

  it('follows the offset of any zone, including daylight saving time', () => {
    expect(iso(startOfLocalDay('2026-11-09', 'UTC'))).toBe('2026-11-09T00:00:00.000Z');
    // New York: UTC-4 until 1 Nov 2026, UTC-5 after it.
    expect(iso(startOfLocalDay('2026-10-31', 'America/New_York'))).toBe('2026-10-31T04:00:00.000Z');
    expect(iso(startOfLocalDay('2026-11-09', 'America/New_York'))).toBe('2026-11-09T05:00:00.000Z');
  });
});

describe('localDateOf', () => {
  it('counts a sale at 22:00 in Brasília as that day, even though it is already the next day in UTC', () => {
    expect(localDateOf(new Date('2026-11-10T01:00:00Z'))).toBe('2026-11-09');
  });

  it('switches day at midnight in Brasília, not in UTC', () => {
    expect(localDateOf(new Date('2026-11-10T02:59:59Z'))).toBe('2026-11-09');
    expect(localDateOf(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-10');
  });
});

describe('resolvePeriod: today and yesterday', () => {
  it('today is the whole day in Brasília', () => {
    const period = resolvePeriod('today', NOON);

    expect([period.from, period.to]).toEqual(['2026-11-11', '2026-11-11']);
    expect(iso(period.start)).toBe('2026-11-11T03:00:00.000Z');
    expect(iso(period.end)).toBe('2026-11-12T03:00:00.000Z');
    expect(period.label).toBe('Hoje, 11/11/2026');
  });

  it('is still the same day at 22:30 in Brasília, when UTC is already the next day', () => {
    const period = resolvePeriod('today', new Date('2026-11-10T01:30:00Z'));

    expect(period.from).toBe('2026-11-09');
    expect(iso(period.start)).toBe('2026-11-09T03:00:00.000Z');
  });

  it('compares today with yesterday over the same hours', () => {
    const { previous } = resolvePeriod('today', NOON);

    expect(iso(previous.start)).toBe('2026-11-10T03:00:00.000Z');
    // 12 hours have passed today, so yesterday is cut at the same 12 hours.
    expect(iso(previous.end)).toBe('2026-11-10T15:00:00.000Z');
    expect(previous.label).toBe('ontem');
  });

  it('yesterday is a whole day, compared with the whole day before it', () => {
    const period = resolvePeriod('yesterday', NOON);

    expect(period.from).toBe('2026-11-10');
    expect(iso(period.start)).toBe('2026-11-10T03:00:00.000Z');
    expect(iso(period.end)).toBe('2026-11-11T03:00:00.000Z');
    expect(iso(period.previous.start)).toBe('2026-11-09T03:00:00.000Z');
    expect(iso(period.previous.end)).toBe('2026-11-10T03:00:00.000Z');
  });
});

describe('resolvePeriod: week', () => {
  it('runs from Monday to Sunday', () => {
    const period = resolvePeriod('week', NOON);

    expect([period.from, period.to]).toEqual(['2026-11-09', '2026-11-15']);
    expect(iso(period.start)).toBe('2026-11-09T03:00:00.000Z');
    expect(iso(period.end)).toBe('2026-11-16T03:00:00.000Z');
    expect(period.label).toBe('Esta semana, 09/11 a 15/11');
  });

  it('starts on that Monday when today is Monday and on the Monday before when today is Sunday', () => {
    expect(resolvePeriod('week', new Date('2026-11-09T15:00:00Z')).from).toBe('2026-11-09');
    expect(resolvePeriod('week', new Date('2026-11-15T20:00:00Z')).from).toBe('2026-11-09');
  });

  it('compares with the week before, cut at the same point of the week', () => {
    const { previous } = resolvePeriod('week', NOON);

    expect(iso(previous.start)).toBe('2026-11-02T03:00:00.000Z');
    // 2 days and 12 hours of this week have passed (Monday 00:00 to Wednesday 12:00).
    expect(iso(previous.end)).toBe('2026-11-04T15:00:00.000Z');
    expect(previous.label).toBe('semana passada');
  });
});

describe('resolvePeriod: month', () => {
  it('runs from the 1st to the end of the last day of the month', () => {
    const period = resolvePeriod('month', NOON);

    expect([period.from, period.to]).toEqual(['2026-11-01', '2026-11-30']);
    expect(iso(period.start)).toBe('2026-11-01T03:00:00.000Z');
    expect(iso(period.end)).toBe('2026-12-01T03:00:00.000Z');
  });

  it('knows December and January', () => {
    const december = resolvePeriod('month', new Date('2026-12-20T15:00:00Z'));
    expect([december.from, december.to]).toEqual(['2026-12-01', '2026-12-31']);

    const january = resolvePeriod('month', new Date('2027-01-10T15:00:00Z'));
    expect([january.from, january.to]).toEqual(['2027-01-01', '2027-01-31']);
    expect(january.previous.start.toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('compares with the month before, never past its end', () => {
    const { previous } = resolvePeriod('month', NOON);

    expect(iso(previous.start)).toBe('2026-10-01T03:00:00.000Z');
    expect(iso(previous.end)).toBe('2026-10-11T15:00:00.000Z');
    expect(previous.label).toBe('mês passado');
  });

  it('leap year February has 29 days', () => {
    const period = resolvePeriod('month', new Date('2028-02-10T15:00:00Z'));

    expect(period.to).toBe('2028-02-29');
  });
});

describe('resolvePeriod: custom', () => {
  it('includes both the first and the last day', () => {
    const period = resolvePeriod('custom', NOON, { from: '2026-11-01', to: '2026-11-07' });

    expect([period.from, period.to]).toEqual(['2026-11-01', '2026-11-07']);
    expect(iso(period.start)).toBe('2026-11-01T03:00:00.000Z');
    expect(iso(period.end)).toBe('2026-11-08T03:00:00.000Z');
    expect(period.label).toBe('De 01/11/2026 a 07/11/2026');
  });

  it('compares with the same number of days right before it', () => {
    const { previous } = resolvePeriod('custom', NOON, { from: '2026-11-01', to: '2026-11-07' });

    expect(iso(previous.start)).toBe('2026-10-25T03:00:00.000Z');
    expect(iso(previous.end)).toBe('2026-11-01T03:00:00.000Z');
  });

  it('a single day is allowed', () => {
    const period = resolvePeriod('custom', NOON, { from: '2026-11-05', to: '2026-11-05' });

    expect(period.start.getTime()).toBeLessThan(period.end.getTime());
    expect(period.from).toBe(period.to);
  });

  it('refuses missing, malformed, reversed and too long periods, with a message the owner can read', () => {
    expect(() => resolvePeriod('custom', NOON)).toThrow(InvalidPeriodError);
    expect(() => resolvePeriod('custom', NOON, { from: '2026-11-01' })).toThrow(/data inicial e a final/);
    expect(() => resolvePeriod('custom', NOON, { from: '01/11/2026', to: '07/11/2026' })).toThrow(InvalidPeriodError);
    expect(() => resolvePeriod('custom', NOON, { from: '2026-02-30', to: '2026-03-01' })).toThrow(InvalidPeriodError);
    expect(() => resolvePeriod('custom', NOON, { from: '2026-11-07', to: '2026-11-01' })).toThrow(/antes da inicial/);
    expect(() => resolvePeriod('custom', NOON, { from: '2025-01-01', to: '2026-11-01' })).toThrow(/no máximo 366 dias/);
  });
});

describe('date helpers', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists the days of a range, both ends included', () => {
    expect(eachDay('2026-11-28', '2026-12-02')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(eachDay('2026-11-05', '2026-11-05')).toEqual(['2026-11-05']);
  });

  it('only accepts real calendar days', () => {
    expect(parseLocalDate('2026-11-09')).toEqual({ year: 2026, month: 11, day: 9 });
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(parseLocalDate('hoje')).toBeNull();
  });
});
