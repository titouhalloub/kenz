import { describe, expect, it } from 'vitest';
import {
  applyFamilyBudgetSources, countRecurringOccurrencesInMonth, createFamilyBudgetPlan, summarizeFamilyBudget, updateFamilyCategory,
  validateFamilyBudgetPlan, FAMILY_BUDGET_DEFAULTS, suggestFamilyBudgetAllocations, normalizeLegacyAutoAllocation,
} from './familyBudget';

describe('family budget foundation', () => {
  it('starts with editable zero allocations and a household profile', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    expect(plan.categories).toHaveLength(FAMILY_BUDGET_DEFAULTS.length);
    expect(plan.adults).toBe(2);
    expect(summarizeFamilyBudget(plan).unallocatedMinor).toBe(0);
  });

  it('calculates surplus, planned remaining, actual and deficit exactly in minor units', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100_000_00;
    plan.categories[0].plannedMinor = 30_000_00;
    plan.categories[0].actualMinor = 12_000_00;
    plan.categories[1].plannedMinor = 50_000_00;
    let summary = summarizeFamilyBudget(plan);
    expect(summary.unallocatedMinor).toBe(20_000_00);
    expect(summary.remainingPlannedMinor).toBe(68_000_00);
    expect(summary.actualMinor).toBe(12_000_00);
    plan.categories[2].plannedMinor = 25_000_00;
    summary = summarizeFamilyBudget(plan);
    expect(summary.deficitMinor).toBe(5_000_00);
    expect(summary.unallocatedMinor).toBe(-5_000_00);
  });

  it('allocates unassigned income using editable category priorities and preserves fixed envelopes', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100000;
    plan.categories.forEach((row) => {
      if (row.id !== 'housing' && row.id !== 'food') { row.plannedMinor = 1; row.plannedOverride = true; }
    });
    plan.categories.find((row) => row.id === 'housing')!.priority = 5;
    plan.categories.find((row) => row.id === 'food')!.priority = 1;
    const suggested = suggestFamilyBudgetAllocations(plan);
    const housing = suggested.categories.find((row) => row.id === 'housing')!;
    const food = suggested.categories.find((row) => row.id === 'food')!;
    expect(housing.plannedMinor).toBeGreaterThan(food.plannedMinor);
    expect(suggested.categories.filter((row) => row.id !== 'housing' && row.id !== 'food').every((row) => row.plannedMinor === 1)).toBe(true);
    expect(suggested.categories.reduce((sum, row) => sum + row.plannedMinor, 0)).toBe(plan.monthlyIncomeMinor);
  });

  it('does not allocate when existing envelopes already exceed the income', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100;
    plan.categories[0].plannedMinor = 200;
    plan.categories[0].plannedOverride = true;
    expect(suggestFamilyBudgetAllocations(plan)).toEqual(plan);
  });

  it('updates only the requested category field', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    const next = updateFamilyCategory(plan, 'food', 'plannedMinor', 12345);
    expect(next.categories.find((row) => row.id === 'food')?.plannedMinor).toBe(12345);
    expect(next.categories.find((row) => row.id === 'food')?.actualMinor).toBe(0);
  });

  it('rejects category edits that would overflow an aggregate total', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    const almostMax = Number.MAX_SAFE_INTEGER - 5;
    const first = updateFamilyCategory(plan, 'housing', 'plannedMinor', almostMax);
    expect(() => updateFamilyCategory(first, 'food', 'plannedMinor', 10)).toThrow();
  });

  it('migrates legacy categories to normal priority and rejects invalid priorities', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    const legacy = { ...plan, categories: plan.categories.map(({ priority: _priority, ...row }) => row) };
    expect(validateFamilyBudgetPlan(legacy, 'user-a')?.categories[0].priority).toBe(3);
    expect(validateFamilyBudgetPlan({ ...plan, categories: plan.categories.map((row, index) => index === 0 ? { ...row, priority: 6 } : row) }, 'user-a')).toBeNull();
  });

  it('rejects unsafe aggregate totals and invalid calendar months', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.categories[0].plannedMinor = Number.MAX_SAFE_INTEGER;
    plan.categories[1].plannedMinor = 1;
    expect(validateFamilyBudgetPlan(plan, 'user-a')).toBeNull();
    expect(validateFamilyBudgetPlan({ ...createFamilyBudgetPlan('user-a', '2026-99') }, 'user-a')).toBeNull();
  });

  it('rejects malformed, cross-user, negative, duplicate or incomplete stored data', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    expect(validateFamilyBudgetPlan(plan, 'user-b')).toBeNull();
    expect(validateFamilyBudgetPlan({ ...plan, monthlyIncomeMinor: -1 }, 'user-a')).toBeNull();
    expect(validateFamilyBudgetPlan({ ...plan, categories: [plan.categories[0], plan.categories[0], ...plan.categories.slice(2)] }, 'user-a')).toBeNull();
    expect(validateFamilyBudgetPlan({ ...plan, categories: plan.categories.slice(1) }, 'user-a')).toBeNull();
  });


  it('counts weekly and biweekly recurring items within a selected month', () => {
    expect(countRecurringOccurrencesInMonth('weekly', '2026-11-02', '2026-11')).toBe(5);
    expect(countRecurringOccurrencesInMonth('biweekly', '2026-11-02', '2026-11')).toBe(3);
    expect(countRecurringOccurrencesInMonth('weekly', '2026-12-01', '2026-11')).toBe(0);
  });

  it('counts monthly, quarterly and yearly commitments on their schedule', () => {
    expect(countRecurringOccurrencesInMonth('monthly', '2026-10-15', '2026-11', 15)).toBe(1);
    expect(countRecurringOccurrencesInMonth('quarterly', '2026-08-15', '2026-11', 15)).toBe(1);
    expect(countRecurringOccurrencesInMonth('quarterly', '2026-08-15', '2026-10', 15)).toBe(0);
    expect(countRecurringOccurrencesInMonth('yearly', '2025-11-30', '2026-11', 31)).toBe(1);
  });

  it('keeps explicit zero and positive allocations as user overrides', () => {
    const base = createFamilyBudgetPlan('user-a', '2026-11');
    const zero = updateFamilyCategory(base, 'housing', 'plannedMinor', 0);
    const positive = updateFamilyCategory(base, 'food', 'plannedMinor', 10_000);
    expect(zero.categories.find((row) => row.id === 'housing')?.plannedOverride).toBe(true);
    expect(positive.categories.find((row) => row.id === 'food')?.plannedOverride).toBe(true);
  });

  it('does not auto-allocate a category the user explicitly set to zero', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100_000;
    const withZeroHousing = updateFamilyCategory(plan, 'housing', 'plannedMinor', 0);
    const suggested = suggestFamilyBudgetAllocations(withZeroHousing);
    expect(suggested.categories.find((row) => row.id === 'housing')?.plannedMinor).toBe(0);
    expect(suggested.categories.find((row) => row.id === 'housing')?.plannedOverride).toBe(true);
  });

  it('keeps generated allocations automatic instead of freezing them as manual overrides', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100_000;
    const suggested = suggestFamilyBudgetAllocations(plan);
    expect(suggested.allocationMode).toBe('automatic');
    expect(suggested.categories.every((row) => row.plannedOverride === false)).toBe(true);
  });

  it('migrates the previous auto-generated equal-weight split out of manual overrides', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 100_000;
    const weightTotal = plan.categories.reduce((sum, row) => sum + row.priority, 0);
    let assigned = 0;
    const legacyShares = plan.categories.map((row) => {
      const amount = Math.floor(plan.monthlyIncomeMinor * row.priority / weightTotal);
      assigned += amount;
      return { ...row, plannedMinor: amount, plannedOverride: true };
    });
    let remainder = plan.monthlyIncomeMinor - assigned;
    for (const row of legacyShares) { if (remainder-- > 0) row.plannedMinor += 1; }
    const legacy = { ...plan, categories: legacyShares, allocationMode: undefined };
    const restored = normalizeLegacyAutoAllocation(legacy);
    expect(restored.allocationMode).toBe('automatic');
    expect(restored.categories.every((row) => row.plannedOverride === false)).toBe(true);
  });

  it('scales the food share with household consumption and recalculates old automatic amounts', () => {
    const small = createFamilyBudgetPlan('user-a', '2026-11');
    small.monthlyIncomeMinor = 750_000;
    small.adults = 1;
    const large = { ...small, adults: 2, children: 3 };
    const smallFood = suggestFamilyBudgetAllocations(small).categories.find((row) => row.id === 'food')!.plannedMinor;
    const largeFood = suggestFamilyBudgetAllocations(large).categories.find((row) => row.id === 'food')!.plannedMinor;
    expect(largeFood).toBeGreaterThan(smallFood);
    const recalculated = suggestFamilyBudgetAllocations({ ...large,
      categories: suggestFamilyBudgetAllocations(small).categories,
    });
    expect(recalculated.categories.find((row) => row.id === 'food')!.plannedMinor).toBe(largeFood);
  });

  it('keeps a genuinely manual food amount fixed while recalculating automatic categories', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 750_000;
    const manual = updateFamilyCategory(plan, 'food', 'plannedMinor', 100_000);
    const recalculated = suggestFamilyBudgetAllocations({ ...manual, allocationMode: 'automatic' });
    expect(recalculated.categories.find((row) => row.id === 'food')!.plannedMinor).toBe(100_000);
    expect(recalculated.categories.find((row) => row.id === 'food')!.plannedOverride).toBe(true);
  });

  it('persists an editable income override through validation', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    plan.monthlyIncomeMinor = 7_500_000;
    plan.monthlyIncomeOverrideMinor = 6_400_000;
    const restored = validateFamilyBudgetPlan(JSON.parse(JSON.stringify(plan)), 'user-a');
    expect(restored?.monthlyIncomeOverrideMinor).toBe(6_400_000);
  });
});
