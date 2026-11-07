import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCachedMarketPrices, writeCachedMarketPrices } from './priceStore';
import type { SimulatorPrice } from '../domain/simulator';

afterEach(() => vi.unstubAllGlobals());

const sample: SimulatorPrice = {
  currency: 'DZD',
  p25UnitPriceMinor: 8000,
  medianUnitPriceMinor: 9000,
  p75UnitPriceMinor: 10000,
  nObservations: 12,
  nContributors: 4,
  lastObserved: '2026-11-06T10:00:00.000Z',
  areaLevel: 'wilaya',
  sourceTiers: ['official'],
};

describe('public market price cache', () => {
  it('stores and restores validated prices by wilaya and product list', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const fetchedAt = writeCachedMarketPrices(['pomme-de-terre'], '15', { 'pomme-de-terre': sample });
    const cached = readCachedMarketPrices(['pomme-de-terre'], '15');

    expect(cached?.source).toBe('cache');
    expect(cached?.fetchedAt).toBe(fetchedAt);
    expect(cached?.pricesBySlug['pomme-de-terre']).toEqual(sample);
    expect(readCachedMarketPrices(['pomme-de-terre'], '16')).toBeNull();
  });

  it('ignores malformed or unsafe cached price values', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    writeCachedMarketPrices(['pomme-de-terre'], null, {
      'pomme-de-terre': { ...sample, medianUnitPriceMinor: -1 },
    });
    expect(readCachedMarketPrices(['pomme-de-terre'], null)).toBeNull();
  });
});
