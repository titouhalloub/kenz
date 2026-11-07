import { describe, expect, it } from 'vitest';
import { filterMedianMadOutliers, normalizePriceRecord } from './normalize';

describe('normalizePriceRecord', () => {
  it('converts a DZD pack price to integer price per base unit', () => {
    expect(normalizePriceRecord({
      title: '1 kg',
      priceText: '250,00 DA',
      currency: 'DZD',
      observedAt: '2026-11-07T10:00:00Z',
      wilayaCode: '16',
    }, 'g')).toMatchObject({
      unitPriceMinor: 25000,
      currency: 'DZD',
      quantityMilliUnits: 1000,
      baseUnit: 'kg',
    });
  });

  it('supports Arabic price digits and units', () => {
    expect(normalizePriceRecord({
      title: '١ كغ',
      priceText: '٢٥٠ دج',
      currency: 'DZD',
      observedAt: '2026-11-07T10:00:00Z',
    }, 'g')?.unitPriceMinor).toBe(25);
  });

  it('rejects missing currency, unsupported currency, invalid dates and ambiguous sizes', () => {
    const base = {
      title: '1 kg',
      priceText: '250',
      observedAt: '2026-11-07T10:00:00Z',
    };
    expect(normalizePriceRecord({ ...base, currency: '' }, 'g')).toBeNull();
    expect(normalizePriceRecord({ ...base, currency: 'EUR' }, 'g')).toBeNull();
    expect(normalizePriceRecord({ ...base, currency: 'DZD', observedAt: 'bad-date' }, 'g')).toBeNull();
    expect(normalizePriceRecord({ ...base, currency: 'DZD', title: 'unknown pack' }, 'g')).toBeNull();
  });
});

describe('filterMedianMadOutliers', () => {
  it('rejects a clearly isolated outlier without inventing a threshold for small samples', () => {
    const rows = [98, 99, 100, 101, 102, 9000].map((unitPriceMinor) => ({ unitPriceMinor }));
    const result = filterMedianMadOutliers(rows);
    expect(result.accepted).toHaveLength(5);
    expect(result.rejected.map((row) => row.unitPriceMinor)).toEqual([9000]);
  });

  it('does not filter a sample smaller than five', () => {
    const rows = [10, 11, 12, 9000].map((unitPriceMinor) => ({ unitPriceMinor }));
    expect(filterMedianMadOutliers(rows).accepted).toHaveLength(4);
  });
});
