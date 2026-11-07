import { normalizePriceText, parsePackQuantity, pricePerBaseUnitMinor, type BaseUnit } from '../../src/domain/units';
import type { NormalizedPriceRecord, RawPriceRecord } from './types';

function parsePriceMinor(priceText: string, currency: string): number | null {
  if (currency.toUpperCase() !== 'DZD') return null;
  const normalized = normalizePriceText(priceText)
    .replace(/\b(?:dzd|da)\b|دج|د\.ج/g, ' ')
    .replace(/\s/g, '')
    .replace(/,/g, '.');
  const match = normalized.match(/(?:^|[^\d])(\d+(?:\.\d{1,2})?)(?:$|[^\d])/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function normalizePriceRecord(
  record: RawPriceRecord,
  baseUnit: BaseUnit,
): NormalizedPriceRecord | null {
  if (!record.title.trim()) return null;
  const observedAt = new Date(record.observedAt);
  if (!Number.isFinite(observedAt.getTime())) return null;

  const baseQuantity = parsePackQuantity(record.title, baseUnit);
  if (!baseQuantity) return null;

  const totalPriceMinor = parsePriceMinor(record.priceText, record.currency);
  if (!totalPriceMinor) return null;

  const unitPriceMinor = pricePerBaseUnitMinor(totalPriceMinor, baseQuantity);
  if (!unitPriceMinor) return null;

  if (record.wilayaCode && !/^\d{2,3}$/.test(record.wilayaCode)) return null;

  return {
    title: record.title.trim().slice(0, 240),
    unitPriceMinor,
    currency: 'DZD',
    observedAt: observedAt.toISOString(),
    ...(record.wilayaCode ? { wilayaCode: record.wilayaCode } : {}),
    ...(record.communeCode ? { communeCode: record.communeCode } : {}),
    ...(record.sourceReference ? { sourceReference: record.sourceReference.slice(0, 500) } : {}),
    baseQuantity,
    baseUnit,
  };
}

export function filterMedianMadOutliers<T extends { unitPriceMinor: number }>(
  rows: T[],
  threshold = 6,
): { accepted: T[]; rejected: T[] } {
  const valid = rows.filter((row) => Number.isSafeInteger(row.unitPriceMinor) && row.unitPriceMinor > 0);
  if (valid.length < 5) return { accepted: valid, rejected: rows.filter((row) => !valid.includes(row)) };

  const sorted = valid.map((row) => row.unitPriceMinor).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  // With zero MAD, only accept values equal to the median; avoid arbitrary ratio guesses.
  const limit = mad === 0 ? 0 : threshold * 1.4826 * mad;
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const row of rows) {
    if (!valid.includes(row)) {
      rejected.push(row);
      continue;
    }
    if (Math.abs(row.unitPriceMinor - median) <= limit) accepted.push(row);
    else rejected.push(row);
  }
  return { accepted, rejected };
}
