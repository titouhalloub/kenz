import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FAMILY_RECIPES, buildShoppingRequirements, createFamilyLivingPlan,
  ingredientKey, scaleIngredient, validateFamilyLivingPlan,
} from './familyLiving';

describe('family living planner', () => {
  it('scales recipe quantities without floating point drift', () => {
    expect(scaleIngredient(300000, 4, 2)).toBe(150000);
    expect(scaleIngredient(3, 2, 3)).toBe(5);
    expect(() => scaleIngredient(10, 0, 2)).toThrow();
  });

  it('aggregates duplicate ingredients across meals and subtracts pantry stock once', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.meals = [
      { id: 'm1', date: '2026-11-01', slot: 'lunch', recipeId: 'dz-tomato-pasta', servings: 4 },
      { id: 'm2', date: '2026-11-02', slot: 'dinner', recipeId: 'dz-tomato-pasta', servings: 2 },
    ];
    plan.pantry = [{ id: 'p1', name: 'طماطم', unit: 'piece', quantityMilli: 3000 }];
    const tomato = buildShoppingRequirements(plan).find((row) => row.key === ingredientKey('طماطم', 'piece'));
    expect(tomato?.requiredMilli).toBe(6000);
    expect(tomato?.inPantryMilli).toBe(3000);
    expect(tomato?.toBuyMilli).toBe(3000);
  });

  it('does not produce negative shopping quantities when stock exceeds need', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.meals = [{ id: 'm1', date: '2026-11-03', slot: 'lunch', recipeId: 'dz-omelette', servings: 2 }];
    plan.pantry = [{ id: 'p1', name: 'بيض', unit: 'piece', quantityMilli: 20000 }];
    const eggs = buildShoppingRequirements(plan).find((row) => row.name === 'بيض');
    expect(eggs?.toBuyMilli).toBe(0);
  });

  it('rejects cross-user, cross-month, duplicate and malformed data', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    expect(validateFamilyLivingPlan(plan, 'u2', '2026-11')).toBeNull();
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-12')).toBeNull();
    expect(validateFamilyLivingPlan({ ...plan, pantry: [{ id: 'a', name: 'rice', unit: 'g', quantityMilli: -1 }] }, 'u1', '2026-11')).toBeNull();
    expect(BUILTIN_FAMILY_RECIPES.length).toBeGreaterThan(0);
  });
});
