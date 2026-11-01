import { describe, expect, it } from 'vitest';
import { currencyExponent, digitsToMinor, formatMinor, minorToPlain, parseUserAmount, sumMinor } from '@/core/money';
import { detectNumberFormat, parseAmountToken } from '@/core/numbers';
import { addDays, daysBetween, detectDateOrder, findDatesInText, formatDate, isoToDays, daysToIso, parseDateParts, resolveWithPeriod } from '@/core/dates';

describe('money', () => {
  it('never uses floats: 0.1 + 0.2 style sums are exact', () => {
    expect(sumMinor([10, 20])).toBe(30);
    expect(digitsToMinor('1234', '5', 2)).toBe(123450);
    expect(digitsToMinor('0', '07', 2)).toBe(7);
  });
  it('formats and round-trips', () => {
    expect(formatMinor(123456)).toBe('1,234.56');
    expect(formatMinor(-5)).toBe('-0.05');
    expect(formatMinor(-5, { parens: true })).toBe('(0.05)');
    expect(formatMinor(123456, { thousands: '.', decimal: ',' })).toBe('1.234,56');
    expect(minorToPlain(-123456)).toBe('-1234.56');
    expect(formatMinor(1500, { exp: 0 })).toBe('1,500');
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });
  it('throws on unsafe integers', () => {
    expect(() => digitsToMinor('99999999999999999', '00', 2)).toThrow();
  });
  it('parses user-typed amounts', () => {
    expect(parseUserAmount('1,234.5')).toBe(123450);
    expect(parseUserAmount('(45.00)')).toBe(-4500);
    expect(parseUserAmount('-12')).toBe(-1200);
    expect(parseUserAmount('12.345')).toBeNull();
    expect(parseUserAmount('abc')).toBeNull();
  });
});

describe('amount tokens', () => {
  const p = (s: string, o = {}) => parseAmountToken(s, o);
  it('US, Indian and European formats', () => {
    expect(p('1,234.56')).toMatchObject({ abs: 123456, dir: 'pos' });
    expect(p('1,23,456.78')).toMatchObject({ abs: 12345678 });
    expect(p('1.234,56', { fmt: 'eu' })).toMatchObject({ abs: 123456 });
    expect(p('12,50', { fmt: 'eu' })).toMatchObject({ abs: 1250 });
    expect(p("1'234.56")).toMatchObject({ abs: 123456 });
  });
  it('negatives: leading minus, parentheses, trailing minus, unicode minus', () => {
    expect(p('-45.00')?.dir).toBe('neg');
    expect(p('(45.00)')?.dir).toBe('neg');
    expect(p('45.00-')?.dir).toBe('neg');
    expect(p('\u221245.00')?.dir).toBe('neg');
    expect(p('-$45.00')?.dir).toBe('neg');
  });
  it('CR / DR suffixes and currency symbols', () => {
    expect(p('75.00 CR')?.dir).toBe('cr');
    expect(p('1,250.00 Dr')?.dir).toBe('dr');
    expect(p('£1,234.56')).toMatchObject({ abs: 123456, currency: 'GBP' });
    expect(p('INR 1,00,000.00')).toMatchObject({ abs: 10000000, currency: 'INR' });
  });
  it('rejects things that are not amounts', () => {
    for (const s of ['1043', '12/05/2025', 'ABC', '', '1,23', '12.5', '(45.00', '4821 1234 5678']) expect(p(s), s).toBeNull();
  });
  it('zero-decimal currencies accept integers', () => {
    expect(p('1,500', { exp: 0 })).toMatchObject({ abs: 1500 });
  });
  it('detects number format from evidence', () => {
    expect(detectNumberFormat(['1.234,56', '12,50', '3,00'])).toBe('eu');
    expect(detectNumberFormat(['1,234.56', '12.50'])).toBe('us');
    expect(detectNumberFormat([])).toBe('us');
  });
});

describe('dates', () => {
  it('parses common formats', () => {
    expect(parseDateParts('03/05/2025', 'mdy')).toMatchObject({ y: 2025, m: 3, d: 5 });
    expect(parseDateParts('03/05/2025', 'dmy')).toMatchObject({ y: 2025, m: 5, d: 3 });
    expect(parseDateParts('2025-03-05')).toMatchObject({ y: 2025, m: 3, d: 5 });
    expect(parseDateParts('05.03.2025', 'dmy')).toMatchObject({ m: 3, d: 5 });
    expect(parseDateParts('Mar 5, 2025')).toMatchObject({ y: 2025, m: 3, d: 5 });
    expect(parseDateParts('5 March 2025')).toMatchObject({ y: 2025, m: 3, d: 5 });
    expect(parseDateParts('05-Mar-25')).toMatchObject({ y: 2025, m: 3, d: 5 });
    expect(parseDateParts('Dec 28')).toEqual({ m: 12, d: 28 });
    expect(parseDateParts('12/28')).toMatchObject({ m: 12, d: 28 });
  });
  it('rejects invalid dates and amounts', () => {
    expect(parseDateParts('02/30/2025')).toBeNull();
    expect(parseDateParts('13/13/2025')).toBeNull();
    expect(parseDateParts('12.50')).toBeNull();
    expect(parseDateParts('Description')).toBeNull();
  });
  it('detects DD/MM vs MM/DD from evidence', () => {
    expect(detectDateOrder(['25/12/2025', '01/02/2025'])).toEqual({ order: 'dmy', confident: true });
    expect(detectDateOrder(['12/25/2025', '01/02/2025'])).toEqual({ order: 'mdy', confident: true });
    expect(detectDateOrder(['01/02/2025'], 'dmy')).toEqual({ order: 'dmy', confident: false });
  });
  it('calendar arithmetic incl. leap years', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
    expect(daysToIso(isoToDays('2000-02-29'))).toBe('2000-02-29');
  });
  it('infers the year across a Dec -> Jan period', () => {
    expect(resolveWithPeriod({ m: 12, d: 28 }, '2024-12-15', '2025-01-14')).toBe('2024-12-28');
    expect(resolveWithPeriod({ m: 1, d: 3 }, '2024-12-15', '2025-01-14')).toBe('2025-01-03');
  });
  it('finds period dates in free text', () => {
    const d = findDatesInText('Statement Period: March 1, 2025 through March 31, 2025', 'mdy');
    expect(d.map((x) => x.parts.d)).toEqual([1, 31]);
  });
  it('formats for export', () => {
    expect(formatDate('2025-03-05', 'mdy')).toBe('03/05/2025');
    expect(formatDate('2025-03-05', 'dd-mon-yyyy')).toBe('05-Mar-2025');
  });
});
