import { describe, expect, it } from 'vitest';
import {
  createFamilyBudgetPlan, summarizeFamilyBudget, updateFamilyCategory,
  validateFamilyBudgetPlan, FAMILY_BUDGET_DEFAULTS, suggestFamilyBudgetAllocations,
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
    expect(summary.unallocatedMinor).toBe(2_000_00);
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
      if (row.id !== 'housing' && row.id !== 'food') row.plannedMinor = 1;
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
});
