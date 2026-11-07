import { describe, expect, it } from 'vitest';
import { simulateMonthlyBudget, type SimulatorInput } from './simulator';

const price = {
  currency: 'DZD' as const,
  p25UnitPriceMinor: 2,
  medianUnitPriceMinor: 3,
  p75UnitPriceMinor: 4,
  nObservations: 8,
  nContributors: 4,
  lastObserved: '2026-11-06T10:00:00Z',
  areaLevel: 'commune' as const,
};

function fixture(month: string, overrides: Partial<SimulatorInput> = {}): SimulatorInput {
  return {
    month,
    household: { adults: 2, children: 1, childConsumptionPermille: 500 },
    availableBudgetMinor: 1_000_000,
    now: '2026-11-07T10:00:00Z',
    items: [{
      productId: 'rice', name: 'Rice', category: 'grains',
      baseUnit: 'g', quantityPerPersonPerDay: 10, price,
    }],
    ...overrides,
  };
}

describe('simulateMonthlyBudget', () => {
  it.each([
    ['2026-02', 28], ['2024-02', 29], ['2026-04', 30], ['2026-11', 30], ['2026-12', 31],
  ])('handles month %s with %i days', (month, expectedDays) => {
    expect(simulateMonthlyBudget(fixture(month)).daysInMonth).toBe(expectedDays);
  });

  it('uses integer household quantities and returns low/expected/high totals', () => {
    const result = simulateMonthlyBudget(fixture('2026-11'));
    expect(result.lines[0].quantityBaseUnits).toBe(750);
    expect(result.pricedSubtotal).toEqual({ lowMinor: 1500, expectedMinor: 2250, highMinor: 3000 });
    expect(result.weeklyTotals.reduce((sum, week) => sum + week.cost.expectedMinor, 0)).toBe(2250);
  });

  it('reports a shortfall when the projected basket exceeds the available budget', () => {
    const result = simulateMonthlyBudget(fixture('2026-11', { availableBudgetMinor: 1000 }));
    expect(result.projectedSurplusMinor).toBe(-1250);
  });

  it('does not guess missing prices or present an incomplete total as a final projection', () => {
    const result = simulateMonthlyBudget(fixture('2026-11', {
      items: [{ productId: 'oil', name: 'Oil', category: 'oils', baseUnit: 'ml', quantityPerPersonPerDay: 10 }],
    }));
    expect(result.complete).toBe(false);
    expect(result.missingProductIds).toEqual(['oil']);
    expect(result.projectedSurplusMinor).toBeNull();
  });

  it('rejects mixed currencies and malformed month values', () => {
    expect(() => simulateMonthlyBudget(fixture('2026-11', {
      items: [{ ...fixture('2026-11').items[0], price: { ...price, currency: 'EUR' as 'DZD' } }],
    }))).toThrow('Mixed currencies');
    expect(() => simulateMonthlyBudget(fixture('2026-13'))).toThrow('Invalid month');
  });

  it('flags stale and thin price data', () => {
    const result = simulateMonthlyBudget(fixture('2026-11', {
      items: [{ ...fixture('2026-11').items[0], price: { ...price, nObservations: 2, nContributors: 2, lastObserved: '2026-10-01T10:00:00Z' } }],
    }));
    expect(result.dataQuality).toEqual({ staleProducts: 1, thinProducts: 1, pricedProducts: 1 });
  });

  it('suggests lower-priced same-category substitutes without mixing units', () => {
    const result = simulateMonthlyBudget(fixture('2026-11', {
      items: [
        { ...fixture('2026-11').items[0], productId: 'rice-premium', price },
        { ...fixture('2026-11').items[0], productId: 'rice-basic', price: { ...price, medianUnitPriceMinor: 2, p25UnitPriceMinor: 1, p75UnitPriceMinor: 3 } },
      ],
    }));
    expect(result.cheapestSubstitutes).toContainEqual({
      fromProductId: 'rice-premium', toProductId: 'rice-basic', estimatedSavingMinor: 10,
    });
  });
});
