import { describe, expect, it } from 'vitest';
import { STARTER_BASKET, quickRowsToItems, toMilliUnits } from './starterBasket';
import { getCatalogProduct } from './productCatalog';
import { simulateMonthlyBudget } from './simulator';

const parse = (v: string) => Math.round(Number(v) * 100) || 0;

describe('starter basket', () => {
  it('only references real catalog products', () => {
    for (const row of STARTER_BASKET) expect(getCatalogProduct(row.slug), row.slug).toBeDefined();
  });
  it('converts pieces to thousandths and grams as-is', () => {
    expect(toMilliUnits('unit', 0.7)).toBe(700);
    expect(toMilliUnits('kg', 100)).toBe(100);
  });
  it('skips rows without a price or quantity and derives a ±10% range from a typed price', () => {
    const items = quickRowsToItems([
      { slug: 'riz', qty: '30', price: '200' }, { slug: 'sucre', qty: '35', price: '' }, { slug: 'tomate', qty: '0', price: '100' },
    ], (s) => s, parse, '2026-11-14T00:00:00Z');
    expect(items).toHaveLength(1);
    expect(items[0].price).toMatchObject({ p25UnitPriceMinor: 18000, medianUnitPriceMinor: 20000, p75UnitPriceMinor: 22000, nObservations: 0 });
  });
  it('feeds the simulator end to end', () => {
    const items = quickRowsToItems([{ slug: 'riz', qty: '100', price: '200' }], (s) => s, parse, '2026-11-14T00:00:00Z');
    const r = simulateMonthlyBudget({ month: '2026-11', household: { adults: 2, children: 0 }, availableBudgetMinor: 1_000_000, now: '2026-11-14T00:00:00Z', items });
    expect(r.pricedSubtotal.expectedMinor).toBe(2 * 30 * 100 * 20000 / 1000);
  });
});
