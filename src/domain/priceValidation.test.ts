import { describe, expect, it } from 'vitest';
import { parsePriceCsv, normalizeWilayaCode, toBaseUnitPrice, validatePriceInput } from './priceValidation';
import { priceLifecycle, resolvePriceWindows } from './priceWindow';

const now = new Date('2026-11-15T10:00:00Z');
const base = { productSlug: 'tomate', unitPriceMinor: 12000, observedAt: '2026-11-10T00:00:00Z', wilayaCode: '16' };

describe('price input validation (shared by every channel)', () => {
  it('normalizes wilaya codes and rejects unknown ones', () => {
    expect(normalizeWilayaCode('6')).toBe('06');
    expect(normalizeWilayaCode('16')).toBe('16');
    expect(normalizeWilayaCode('999')).toBeNull();
    expect(normalizeWilayaCode('Alger')).toBeNull();
  });

  it('accepts a valid row as a candidate with a normalized date and wilaya', () => {
    const result = validatePriceInput({ ...base, wilayaCode: '6' }, { now });
    expect(result.ok).toBe(true);
    expect(result.row?.wilayaCode).toBe('06');
    expect(result.row?.observedAt).toBe('2026-11-10T00:00:00.000Z');
    expect(result.flags).toEqual([]);
  });

  it('rejects unknown product, bad price, bad/future date, unknown wilaya and non-https URLs', () => {
    expect(validatePriceInput({ ...base, productSlug: 'nope' }, { now }).errors).toContain('unknown_product');
    expect(validatePriceInput({ ...base, unitPriceMinor: 0 }, { now }).errors).toContain('invalid_price');
    expect(validatePriceInput({ ...base, observedAt: 'x' }, { now }).errors).toContain('invalid_date');
    expect(validatePriceInput({ ...base, observedAt: '2026-12-25T00:00:00Z' }, { now }).errors).toContain('future_date');
    expect(validatePriceInput({ ...base, wilayaCode: '999' }, { now }).errors).toContain('unknown_wilaya');
    expect(validatePriceInput({ ...base, sourceReference: 'http://example.com/a' }, { now }).errors).toContain('source_reference_not_https');
    expect(validatePriceInput({ ...base, sourceReference: 'Bulletin MADR 12/11' }, { now }).ok).toBe(true);
  });

  it('flags old, outlying and duplicate rows instead of silently accepting them', () => {
    expect(validatePriceInput({ ...base, observedAt: '2026-10-28T00:00:00Z' }, { now }).flags).toContain('older_than_fresh_window');
    expect(validatePriceInput({ ...base, observedAt: '2026-09-01T00:00:00Z' }, { now }).flags).toContain('older_than_extended_window');
    expect(validatePriceInput({ ...base, unitPriceMinor: 100000 }, { now, referenceMedianBySlug: { tomate: 12000 } }).flags).toContain('outside_reference_range');
    const seen = new Set<string>();
    expect(validatePriceInput(base, { now, seenKeys: seen }).flags).toEqual([]);
    expect(validatePriceInput(base, { now, seenKeys: seen }).flags).toContain('duplicate_in_batch');
  });
});

describe('unit consistency', () => {
  it('converts g→kg and ml→l and refuses dimension mismatches', () => {
    expect(toBaseUnitPrice(12, 'g', 'kg')).toBe(12000);
    expect(toBaseUnitPrice(15, 'ml', 'l')).toBe(15000);
    expect(toBaseUnitPrice(1500, 'kg', 'kg')).toBe(1500);
    expect(toBaseUnitPrice(1500, 'l', 'kg')).toBeNull();
    expect(toBaseUnitPrice(1500, 'kg', 'unit')).toBeNull();
    expect(toBaseUnitPrice(1500, 'unité', 'unit')).toBe(1500);
  });
});

describe('admin CSV parsing', () => {
  const header = 'product_slug,unit_price,observed_at,unit,wilaya_code,source_reference';
  it('parses valid rows (DZD → minor) and reports each bad line without importing it', () => {
    const csv = [header,
      'tomate,120.50,2026-11-10,kg,16,https://example.dz/b1',
      'inconnu,10,2026-11-10,kg,16,',
      'oeufs,17,2026-11-10,kg,16,',
      'huile-table,abc,2026-11-10,l,16,'].join('\n');
    const result = parsePriceCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ productSlug: 'tomate', unitPriceMinor: 12050, wilayaCode: '16' });
    expect(result.errors.map((e) => [e.line, e.message.split(' ')[0]])).toEqual([[3, 'unknown_product'], [4, 'unit_mismatch'], [5, 'invalid_price']]);
  });

  it('requires the mandatory columns', () => {
    expect(parsePriceCsv('product_slug,unit_price\ntomate,10').errors[0].message).toMatch(/Missing columns/);
  });
});

describe('lifecycle and windows', () => {
  it('derives pending / verified / rejected / expired and never marks old data verified', () => {
    expect(priceLifecycle('pending', '2026-11-10T00:00:00Z', now)).toBe('pending');
    expect(priceLifecycle('accepted', '2026-11-10T00:00:00Z', now)).toBe('verified');
    expect(priceLifecycle('rejected', '2026-11-10T00:00:00Z', now)).toBe('rejected');
    expect(priceLifecycle('accepted', '2026-09-01T00:00:00Z', now)).toBe('expired');
    expect(priceLifecycle('pending', 'garbage', now)).toBe('expired');
  });

  it('accepts configured windows only when sane', () => {
    expect(resolvePriceWindows({ fresh_days: 10, extended_days: 45 })).toEqual({ freshDays: 10, extendedDays: 45 });
    expect(resolvePriceWindows({ fresh_days: 40, extended_days: 30 })).toEqual({ freshDays: 14, extendedDays: 30 });
    expect(resolvePriceWindows(null)).toEqual({ freshDays: 14, extendedDays: 30 });
  });
});
