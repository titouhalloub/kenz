import type { BaseUnit } from './units';

export interface SimulatorPrice {
  currency: string;
  p25UnitPriceMinor: number;
  medianUnitPriceMinor: number;
  p75UnitPriceMinor: number;
  nObservations: number;
  nContributors: number;
  lastObserved: string;
  areaLevel: 'neighborhood' | 'commune' | 'wilaya' | 'national';
}

export interface SimulatorBasketItem {
  productId: string;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  quantityPerPersonPerDay: number;
  price?: SimulatorPrice;
}

export interface SimulatorInput {
  month: string; // YYYY-MM
  household: {
    adults: number;
    children: number;
    childConsumptionPermille?: number; // default 500 = half an adult portion
  };
  availableBudgetMinor: number;
  items: SimulatorBasketItem[];
  now?: string; // ISO timestamp, injectable for deterministic tests
}

export interface SimulatorCostBand {
  lowMinor: number;
  expectedMinor: number;
  highMinor: number;
}

export interface SimulatorLine {
  productId: string;
  name: string;
  category: string;
  quantityBaseUnits: number;
  baseUnit: BaseUnit;
  cost: SimulatorCostBand | null;
  data: {
    nObservations: number;
    nContributors: number;
    lastObserved: string;
    ageDays: number | null;
    stale: boolean;
    thin: boolean;
    areaLevel: SimulatorPrice['areaLevel'];
  } | null;
}

export interface SimulatorResult {
  month: string;
  daysInMonth: number;
  lines: SimulatorLine[];
  categoryTotals: Array<{ category: string; cost: SimulatorCostBand }>;
  weeklyTotals: Array<{ week: number; startDay: number; endDay: number; cost: SimulatorCostBand }>;
  pricedSubtotal: SimulatorCostBand;
  missingProductIds: string[];
  complete: boolean;
  availableBudgetMinor: number;
  projectedSurplusMinor: number | null;
  daysCovered: number | null;
  dataQuality: { staleProducts: number; thinProducts: number; pricedProducts: number };
  cheapestSubstitutes: Array<{ fromProductId: string; toProductId: string; estimatedSavingMinor: number }>;
}

const isSafePositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const isSafeNonNegativeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0;

function monthDays(month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must use YYYY-MM format.');
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12 || year < 1) throw new Error('Invalid month.');
  return new Date(year, monthNumber, 0).getDate();
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Simulator amount exceeds safe integer range.');
  return result;
}

function allocateBand(total: SimulatorCostBand, daysInMonth: number): SimulatorResult['weeklyTotals'] {
  const weeks: SimulatorResult['weeklyTotals'] = [];
  for (let startDay = 1, week = 1; startDay <= daysInMonth; startDay += 7, week += 1) {
    const endDay = Math.min(daysInMonth, startDay + 6);
    const days = endDay - startDay + 1;
    const bandValue = (value: number) => Math.floor((value * days) / daysInMonth);
    weeks.push({
      week,
      startDay,
      endDay,
      cost: {
        lowMinor: bandValue(total.lowMinor),
        expectedMinor: bandValue(total.expectedMinor),
        highMinor: bandValue(total.highMinor),
      },
    });
  }
  // Preserve exact monthly totals by assigning rounding remainders to the last week.
  const last = weeks[weeks.length - 1];
  for (const key of ['lowMinor', 'expectedMinor', 'highMinor'] as const) {
    const allocated = weeks.reduce((sum, week) => sum + week.cost[key], 0);
    last.cost[key] += total[key] - allocated;
  }
  return weeks;
}

export function simulateMonthlyBudget(input: SimulatorInput): SimulatorResult {
  const daysInMonth = monthDays(input.month);
  const { adults, children, childConsumptionPermille = 500 } = input.household;
  if (!isSafePositiveInteger(adults) || !isSafeNonNegativeInteger(children) ||
      !isSafeNonNegativeInteger(childConsumptionPermille) || childConsumptionPermille > 1000) {
    throw new Error('Invalid household composition.');
  }
  if (!Number.isSafeInteger(input.availableBudgetMinor)) throw new Error('Budget must be an integer minor-unit amount.');

  const now = new Date(input.now ?? new Date().toISOString());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current date.');

  const householdPermille = BigInt(adults) * 1000n + BigInt(children) * BigInt(childConsumptionPermille);
  const lines: SimulatorLine[] = [];
  const missingProductIds: string[] = [];
  let lowTotal = 0n;
  let expectedTotal = 0n;
  let highTotal = 0n;
  let staleProducts = 0;
  let thinProducts = 0;
  let pricedProducts = 0;
  const categories = new Map<string, SimulatorCostBand>();

  for (const item of input.items) {
    if (!item.productId || !item.name || !item.category || !isSafeNonNegativeInteger(item.quantityPerPersonPerDay)) {
      throw new Error('Invalid basket item.');
    }

    const quantity = safeNumber(ceilDiv(
      BigInt(item.quantityPerPersonPerDay) * householdPermille * BigInt(daysInMonth),
      1000n,
    ));
    if (!item.price) {
      missingProductIds.push(item.productId);
      lines.push({ productId: item.productId, name: item.name, category: item.category, quantityBaseUnits: quantity, baseUnit: item.baseUnit, cost: null, data: null });
      continue;
    }

    const price = item.price;
    if (price.currency !== 'DZD') throw new Error('Mixed currencies are not supported by the DZD simulator.');
    if (![price.p25UnitPriceMinor, price.medianUnitPriceMinor, price.p75UnitPriceMinor].every(isSafePositiveInteger) ||
        price.p25UnitPriceMinor > price.medianUnitPriceMinor ||
        price.medianUnitPriceMinor > price.p75UnitPriceMinor ||
        !isSafeNonNegativeInteger(price.nObservations) ||
        !isSafeNonNegativeInteger(price.nContributors)) {
      throw new Error('Invalid price statistics.');
    }

    const cost: SimulatorCostBand = {
      lowMinor: safeNumber(BigInt(quantity) * BigInt(price.p25UnitPriceMinor)),
      expectedMinor: safeNumber(BigInt(quantity) * BigInt(price.medianUnitPriceMinor)),
      highMinor: safeNumber(BigInt(quantity) * BigInt(price.p75UnitPriceMinor)),
    };
    lowTotal += BigInt(cost.lowMinor);
    expectedTotal += BigInt(cost.expectedMinor);
    highTotal += BigInt(cost.highMinor);
    pricedProducts += 1;

    const lastObserved = new Date(price.lastObserved);
    const ageDays = Number.isFinite(lastObserved.getTime())
      ? Math.max(0, Math.floor((now.getTime() - lastObserved.getTime()) / 86_400_000))
      : null;
    const stale = ageDays === null || ageDays > 14;
    const thin = price.nObservations < 3;
    if (stale) staleProducts += 1;
    if (thin) thinProducts += 1;

    const existing = categories.get(item.category) ?? { lowMinor: 0, expectedMinor: 0, highMinor: 0 };
    existing.lowMinor += cost.lowMinor;
    existing.expectedMinor += cost.expectedMinor;
    existing.highMinor += cost.highMinor;
    categories.set(item.category, existing);

    lines.push({
      productId: item.productId, name: item.name, category: item.category,
      quantityBaseUnits: quantity, baseUnit: item.baseUnit, cost,
      data: {
        nObservations: price.nObservations, nContributors: price.nContributors,
        lastObserved: price.lastObserved, ageDays, stale, thin, areaLevel: price.areaLevel,
      },
    });
  }

  const pricedSubtotal = {
    lowMinor: safeNumber(lowTotal),
    expectedMinor: safeNumber(expectedTotal),
    highMinor: safeNumber(highTotal),
  };
  const complete = missingProductIds.length === 0;
  const expectedDaily = daysInMonth > 0 ? Math.ceil(pricedSubtotal.expectedMinor / daysInMonth) : 0;

  return {
    month: input.month,
    daysInMonth,
    lines,
    categoryTotals: [...categories.entries()].map(([category, cost]) => ({ category, cost })),
    weeklyTotals: allocateBand(pricedSubtotal, daysInMonth),
    pricedSubtotal,
    missingProductIds,
    complete,
    availableBudgetMinor: input.availableBudgetMinor,
    projectedSurplusMinor: complete ? input.availableBudgetMinor - pricedSubtotal.expectedMinor : null,
    daysCovered: complete && expectedDaily > 0
      ? Math.max(0, Math.floor(input.availableBudgetMinor / expectedDaily))
      : null,
    dataQuality: { staleProducts, thinProducts, pricedProducts },
    cheapestSubstitutes: buildCheapestSubstitutes(input.items, householdPermille, daysInMonth),
  };
}

function buildCheapestSubstitutes(items: SimulatorBasketItem[], householdPermille: bigint, daysInMonth: number): SimulatorResult['cheapestSubstitutes'] {
  const suggestions: SimulatorResult['cheapestSubstitutes'] = [];
  for (const item of items) {
    if (!item.price || item.quantityPerPersonPerDay <= 0) continue;
    const alternatives = items.filter((candidate) =>
      candidate.productId !== item.productId &&
      candidate.category === item.category &&
      candidate.baseUnit === item.baseUnit &&
      candidate.price?.currency === 'DZD' &&
      candidate.price.medianUnitPriceMinor < item.price!.medianUnitPriceMinor
    );
    const cheapest = alternatives.sort((a, b) =>
      a.price!.medianUnitPriceMinor - b.price!.medianUnitPriceMinor
    )[0];
    if (!cheapest) continue;
    const savingPerBaseUnit = BigInt(item.price.medianUnitPriceMinor - cheapest.price!.medianUnitPriceMinor);
    const monthlyQuantity = ceilDiv(BigInt(item.quantityPerPersonPerDay) * householdPermille * BigInt(daysInMonth), 1000n);
    suggestions.push({
      fromProductId: item.productId,
      toProductId: cheapest.productId,
      estimatedSavingMinor: safeNumber(savingPerBaseUnit * monthlyQuantity),
    });
  }
  return suggestions;
}
