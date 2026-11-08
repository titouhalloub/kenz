import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FAMILY_RECIPES, buildShoppingRequirements, createFamilyLivingPlan,
  ingredientKey, scaleIngredient, validateFamilyLivingPlan, parseCommunityRecipe, suggestFamilyWeek, suggestFamilyMonth,
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

  it('merges manual cleaning and grocery items into the recipe shopping list', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.meals = [{ id: 'm1', date: '2026-11-01', slot: 'lunch', recipeId: 'dz-tomato-pasta', servings: 4 }];
    plan.shoppingExtras = [
      { id: 's1', name: 'tomate', unit: 'piece', quantityMilli: 1000, category: 'grocery' },
      { id: 's2', name: 'lessive', unit: 'ml', quantityMilli: 2000, category: 'cleaning' },
    ];
    plan.pantry = [{ id: 'p1', name: 'طماطم', unit: 'piece', quantityMilli: 3000 }];
    const tomato = buildShoppingRequirements(plan).find((row) => row.key === ingredientKey('طماطم', 'piece'));
    const detergent = buildShoppingRequirements(plan).find((row) => row.name === 'lessive');
    expect(tomato?.requiredMilli).toBe(5000);
    expect(tomato?.toBuyMilli).toBe(2000);
    expect(detergent?.toBuyMilli).toBe(2000);
  });

  it('matches common grocery names across Arabic and French', () => {
    expect(ingredientKey('طماطم', 'piece')).toBe(ingredientKey('tomate', 'piece'));
    expect(ingredientKey('بيض', 'piece')).toBe(ingredientKey('oeufs', 'piece'));
  });

  it('rejects impossible calendar dates and incomplete community recipes', () => {
    const plan = createFamilyLivingPlan('u1', '2026-02');
    plan.meals = [{ id: 'm1', date: '2026-02-31', slot: 'lunch', recipeId: 'dz-omelette', servings: 2 }];
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-02')).toBeNull();
    expect(parseCommunityRecipe({ title: 'Soup', description: 'Good', baseServings: 2, prepMinutes: 10, ingredients: [{ name: 'water', quantityMilli: 1000, unit: 'ml' }], steps: [] }, 'community-x')).toBeNull();
    expect(parseCommunityRecipe({ title: 'Soup', description: 'Good', baseServings: 2, prepMinutes: 10, ingredients: [{ name: 'water', quantityMilli: Number.MAX_SAFE_INTEGER, unit: 'ml' }], steps: ['Boil water.'] }, 'community-big')).toBeNull();
  });

  it('accepts legacy monthly plans without the optional needs list', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    const { needs: _needs, shoppingExtras: _extras, ...legacy } = plan;
    const restored = validateFamilyLivingPlan(legacy, 'u1', '2026-11');
    expect(restored?.needs).toEqual([]);
  });

  it('validates clothing and cleaning line items and rejects unsafe totals', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.needs = [
      { id: 'n1', category: 'clothing', name: 'Winter coat', member: 'Member A', season: 'winter', size: 'M', plannedMinor: 120000, actualMinor: 0, dueDate: '2026-11-10' },
      { id: 'n2', category: 'cleaning', name: 'Laundry detergent', plannedMinor: 25000, actualMinor: 5000 },
    ];
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-11')?.needs).toHaveLength(2);
    plan.needs[1].plannedMinor = Number.MAX_SAFE_INTEGER;
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-11')).toBeNull();
  });

  it('rejects cross-user, cross-month, duplicate and malformed data', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    expect(validateFamilyLivingPlan(plan, 'u2', '2026-11')).toBeNull();
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-12')).toBeNull();
    expect(validateFamilyLivingPlan({ ...plan, pantry: [{ id: 'a', name: 'rice', unit: 'g', quantityMilli: -1 }] }, 'u1', '2026-11')).toBeNull();
    expect(BUILTIN_FAMILY_RECIPES.length).toBeGreaterThan(0);
  });
  it('fills the entire selected month with three meals per day and preserves existing choices', () => {
    const existing = [
      { id: 'keep-breakfast', date: '2026-11-01', slot: 'breakfast' as const, recipeId: 'dz-omelette', servings: 3 },
      { id: 'keep-lunch', date: '2026-11-15', slot: 'lunch' as const, recipeId: 'dz-couscous-vegetables', servings: 4 },
    ];
    const result = suggestFamilyMonth(existing, '2026-11', 4);
    expect(result).toHaveLength(31 * 3);
    expect(result.find((meal) => meal.id === 'keep-breakfast')).toMatchObject({ servings: 3, recipeId: 'dz-omelette' });
    expect(result.find((meal) => meal.id === 'keep-lunch')).toMatchObject({ servings: 4, recipeId: 'dz-couscous-vegetables' });
    expect(new Set(result.map((meal) => meal.date + '::' + meal.slot)).size).toBe(31 * 3);
    expect(result.filter((meal) => meal.servings === 4)).toHaveLength(31 * 3 - 2);
  });

  it('handles February and rejects invalid monthly planning inputs', () => {
    expect(suggestFamilyMonth([], '2026-02', 2)).toHaveLength(28 * 3);
    expect(() => suggestFamilyMonth([], '2026-13', 2)).toThrow();
    expect(() => suggestFamilyMonth([], '2026-11', 0)).toThrow();
  });

  it('creates all three meals for a week for the household and preserves existing meals', () => {
    const existing = [{ id: 'kept', date: '2026-11-01', slot: 'lunch' as const, recipeId: 'dz-couscous-vegetables', servings: 5 }];
    const result = suggestFamilyWeek(existing, '2026-11-01', '2026-11', 5);
    expect(result.filter((meal) => meal.date >= '2026-11-01' && meal.date <= '2026-11-07')).toHaveLength(21);
    expect(result.find((meal) => meal.id === 'kept')).toBeDefined();
    expect(result.every((meal) => meal.servings === 5)).toBe(true);
  });

});
