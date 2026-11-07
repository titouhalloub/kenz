import { describe, expect, it } from 'vitest';
import {
  createFamilyBudgetPlan, summarizeFamilyBudget, updateFamilyCategory,
  validateFamilyBudgetPlan, FAMILY_BUDGET_DEFAULTS,
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

  it('updates only the requested category field', () => {
    const plan = createFamilyBudgetPlan('user-a', '2026-11');
    const next = updateFamilyCategory(plan, 'food', 'plannedMinor', 12345);
    expect(next.categories.find((row) => row.id === 'food')?.plannedMinor).toBe(12345);
    expect(next.categories.find((row) => row.id === 'food')?.actualMinor).toBe(0);
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
