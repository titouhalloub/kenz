import { describe, expect, it } from 'vitest';
import {
  canonicalToBaseMilli, convertToCanonical, normalizeIngredientName, resolveIngredient, resolveProduct,
} from './ingredientMapping';
import { getCatalogProduct, PRODUCT_CATALOG } from './productCatalog';
import {
  BUILTIN_FAMILY_RECIPES, buildShoppingRequirements, createFamilyLivingPlan, exportCommunityRecipe,
  parseCommunityRecipe, validateFamilyLivingPlan,
} from './familyLiving';

const product = (slug: string) => getCatalogProduct(slug)!;

describe('ingredient aliases (Arabic / French / English)', () => {
  it('maps the same product from all three languages and common spellings', () => {
    for (const name of ['طماطم', 'الطماطم', 'tomate', 'Tomates', 'tomato', 'TOMATOES']) {
      expect(resolveProduct(name)).toMatchObject({ status: 'mapped', productId: 'tomate' });
    }
    for (const name of ['بيض', 'oeufs', 'Œufs', 'œuf', 'eggs']) {
      expect(resolveProduct(name)).toMatchObject({ status: 'mapped', productId: 'oeufs' });
    }
    expect(resolveProduct('كُسْكُس')).toMatchObject({ status: 'mapped', productId: 'couscous' });
    expect(resolveProduct('pois chiches')).toMatchObject({ status: 'mapped', productId: 'pois-chiches' });
    expect(resolveProduct('cooking oil')).toMatchObject({ status: 'mapped', productId: 'huile-table' });
    expect(resolveProduct('زيت المائدة')).toMatchObject({ status: 'mapped', productId: 'huile-table' });
  });

  it('normalizes accents, tashkeel, case and spacing', () => {
    expect(normalizeIngredientName('  Pâtes   ')).toBe('pates');
    expect(normalizeIngredientName('طَمَاطِم')).toBe('طماطم');
  });

  it('never maps ambiguous names: bare oil, pasta, milk, semolina stay UNPRICED with candidates', () => {
    for (const name of ['زيت', 'huile', 'oil', 'معكرونة', 'pâtes', 'lait', 'milk', 'semoule']) {
      const result = resolveProduct(name);
      expect(result.status, name).toBe('unpriced');
      expect(result).toMatchObject({ reason: 'ambiguous' });
    }
    expect((resolveProduct('lait') as { candidates: string[] }).candidates).toEqual(['lait-sachet', 'lait-poudre']);
  });

  it('keeps processed forms UNPRICED because the catalog prices the raw product', () => {
    expect(resolveProduct('حمص مطبوخ')).toMatchObject({ status: 'unpriced', reason: 'processed_form' });
    expect(resolveProduct('pois chiches cuits')).toMatchObject({ status: 'unpriced', reason: 'processed_form' });
    expect(resolveProduct('cooked chickpeas')).toMatchObject({ status: 'unpriced', reason: 'processed_form' });
  });

  it('keeps unknown ingredients UNPRICED and never invents a product', () => {
    expect(resolveProduct('زعفران نادر')).toEqual({ status: 'unpriced', reason: 'unmapped' });
    expect(resolveProduct('')).toEqual({ status: 'unpriced', reason: 'unmapped' });
    expect(resolveProduct('dragon fruit')).toEqual({ status: 'unpriced', reason: 'unmapped' });
  });

  it('every alias target is a real catalog product', () => {
    for (const row of PRODUCT_CATALOG) expect(resolveProduct(row.nameFr)).toMatchObject({ status: 'mapped', productId: row.slug });
  });
});

describe('explicit / invalid mappings', () => {
  it('uses a valid author-supplied productId even for an ambiguous name', () => {
    expect(resolveProduct('زيت', 'huile-table')).toEqual({ status: 'mapped', productId: 'huile-table', source: 'explicit' });
  });

  it('rejects an unknown productId instead of guessing from the name', () => {
    expect(resolveProduct('tomate', 'tomate-inexistante')).toEqual({ status: 'unpriced', reason: 'invalid_mapping' });
    expect(resolveIngredient('tomate', 'g', 1000, '')).toMatchObject({ status: 'unpriced', reason: 'invalid_mapping' });
  });
});

describe('unit conversion', () => {
  it('converts g→kg and ml→l exactly through canonical units', () => {
    const kg = resolveIngredient('عدس', 'g', 300000);
    expect(kg).toMatchObject({ status: 'mapped', productId: 'lentilles', baseUnit: 'kg', canonicalUnit: 'g', canonicalMilli: 300000, baseQuantityMilli: 300, approximate: false });
    const litre = resolveIngredient('huile de table', 'ml', 30000);
    expect(litre).toMatchObject({ status: 'mapped', baseUnit: 'l', canonicalUnit: 'ml', baseQuantityMilli: 30, approximate: false });
  });

  it('converts pieces to units exactly for unit products', () => {
    expect(resolveIngredient('بيض', 'piece', 4000)).toMatchObject({ status: 'mapped', baseUnit: 'unit', baseQuantityMilli: 4000, approximate: false });
    expect(resolveIngredient('baguette de pain', 'piece', 1000)).toMatchObject({ status: 'mapped', productId: 'baguette', baseQuantityMilli: 1000 });
  });

  it('converts pieces of kg products only with a declared average weight, flagged approximate', () => {
    expect(resolveIngredient('طماطم', 'piece', 2000)).toMatchObject({ status: 'mapped', canonicalUnit: 'g', canonicalMilli: 240000, baseQuantityMilli: 240, approximate: true });
  });

  it('refuses pieces of a product with no declared weight (garlic: clove vs head)', () => {
    expect(resolveIngredient('ثوم', 'piece', 2000)).toEqual({ status: 'unpriced', reason: 'ambiguous_piece' });
  });

  it('refuses unit mismatches with no valid conversion', () => {
    expect(convertToCanonical(product('huile-table'), 'g', 1000)).toEqual({ ok: false, reason: 'incompatible_unit' });
    expect(convertToCanonical(product('tomate'), 'ml', 1000)).toEqual({ ok: false, reason: 'incompatible_unit' });
    expect(convertToCanonical(product('oeufs'), 'g', 1000)).toEqual({ ok: false, reason: 'incompatible_unit' });
    expect(convertToCanonical(product('huile-table'), 'piece', 1000)).toEqual({ ok: false, reason: 'incompatible_unit' });
    expect(resolveIngredient('عدس', 'ml', 1000)).toEqual({ status: 'unpriced', reason: 'incompatible_unit' });
  });

  it('rejects negative or unsafe quantities', () => {
    expect(convertToCanonical(product('tomate'), 'g', -1)).toMatchObject({ ok: false });
    expect(convertToCanonical(product('tomate'), 'piece', Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false });
  });

  it('rounds canonical→base half up', () => {
    expect(canonicalToBaseMilli('kg', 499)).toBe(0);
    expect(canonicalToBaseMilli('kg', 500)).toBe(1);
    expect(canonicalToBaseMilli('kg', 1499)).toBe(1);
    expect(canonicalToBaseMilli('kg', 1500)).toBe(2);
    expect(canonicalToBaseMilli('unit', 1500)).toBe(1500);
  });
});

describe('built-in recipes use the mapping', () => {
  it('every explicit productId in the five built-in recipes exists in the catalog', () => {
    expect(BUILTIN_FAMILY_RECIPES).toHaveLength(5);
    for (const recipe of BUILTIN_FAMILY_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        if (ingredient.productId) expect(getCatalogProduct(ingredient.productId), `${recipe.id}/${ingredient.name}`).toBeDefined();
      }
    }
  });

  it('classifies every built-in ingredient as priced or explicitly UNPRICED, with the expected exceptions', () => {
    const unpriced: string[] = [];
    for (const recipe of BUILTIN_FAMILY_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        const result = resolveIngredient(ingredient.name, ingredient.unit, ingredient.quantityMilli, ingredient.productId);
        if (result.status === 'unpriced') unpriced.push(`${recipe.id}:${ingredient.name}:${result.reason}`);
      }
    }
    expect(unpriced.sort()).toEqual([
      'dz-chickpea-salad:حمص مطبوخ:processed_form',
      'dz-lentil-soup:ثوم:ambiguous_piece',
      'dz-tomato-pasta:ثوم:ambiguous_piece',
    ]);
  });
});

describe('monthly shopping list aggregation with scaled servings', () => {
  const monthPlan = () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.meals = [
      { id: 'm1', date: '2026-11-01', slot: 'lunch', recipeId: 'dz-lentil-soup', servings: 4 },
      { id: 'm2', date: '2026-11-02', slot: 'lunch', recipeId: 'dz-lentil-soup', servings: 8 },
      { id: 'm3', date: '2026-11-03', slot: 'dinner', recipeId: 'dz-tomato-pasta', servings: 6 },
      { id: 'm4', date: '2026-11-04', slot: 'breakfast', recipeId: 'dz-omelette', servings: 2 },
      { id: 'm5', date: '2026-11-05', slot: 'breakfast', recipeId: 'dz-omelette', servings: 3 },
    ];
    return plan;
  };
  const row = (plan = monthPlan(), id = '') => buildShoppingRequirements(plan).find((r) => r.productId === id);

  it('sums scaled quantities per product in exact canonical units, then converts once to the base unit', () => {
    const lentils = row(undefined, 'lentilles');
    expect(lentils).toMatchObject({ unit: 'g', requiredMilli: 900000, requiredBaseMilli: 900, baseUnit: 'kg', priced: true, approximate: false });
    const eggs = row(undefined, 'oeufs');
    expect(eggs).toMatchObject({ unit: 'piece', requiredMilli: 10000, requiredBaseMilli: 10000, baseUnit: 'unit' });
    const oil = row(undefined, 'huile-table');
    // 30 + 60 + 45 + 15 + 22.5 = 172.5 ml → 173 milli-litres (half up)
    expect(oil).toMatchObject({ unit: 'ml', requiredMilli: 172500, requiredBaseMilli: 173, baseUnit: 'l' });
    const tomato = row(undefined, 'tomate');
    // 14.5 pieces × 120 g = 1 740 g, flagged approximate
    expect(tomato).toMatchObject({ unit: 'g', requiredMilli: 1740000, requiredBaseMilli: 1740, approximate: true });
  });

  it('merges duplicate ingredients written in different languages and units into one product line', () => {
    const plan = monthPlan();
    plan.shoppingExtras = [
      { id: 'e1', name: 'tomatoes', unit: 'g', quantityMilli: 260000, category: 'grocery' },
      { id: 'e2', name: 'Tomate', unit: 'piece', quantityMilli: 1000, category: 'grocery' },
    ];
    const tomatoRows = buildShoppingRequirements(plan).filter((r) => r.productId === 'tomate');
    expect(tomatoRows).toHaveLength(1);
    // 1 740 g + 260 g + 1 piece (120 g)
    expect(tomatoRows[0].requiredMilli).toBe(2120000);
  });

  it('keeps unmappable lines as separate UNPRICED rows with their quantity', () => {
    const garlic = buildShoppingRequirements(monthPlan()).find((r) => r.name === 'ثوم');
    expect(garlic).toMatchObject({ priced: false, unpricedReason: 'ambiguous_piece', unit: 'piece', requiredMilli: 9000 });
    expect(garlic?.productId).toBeUndefined();
    expect(garlic?.requiredBaseMilli).toBeUndefined();
  });

  it('subtracts pantry stock through valid conversions only', () => {
    const plan = monthPlan();
    plan.pantry = [
      { id: 'p1', name: 'tomate', unit: 'g', quantityMilli: 500000 },
      { id: 'p2', name: 'طماطم', unit: 'piece', quantityMilli: 2000 },       // 240 g
      { id: 'p3', name: 'طماطم', unit: 'ml', quantityMilli: 999000 },        // invalid for a kg product: ignored
      { id: 'p4', name: 'زيت', unit: 'ml', quantityMilli: 100000 },          // same literal name+unit as the recipe line
      { id: 'p5', name: 'عدس', unit: 'ml', quantityMilli: 900000 },          // wrong unit: ignored
      { id: 'p6', name: 'ثوم', unit: 'piece', quantityMilli: 4000 },         // unpriced row, same name+unit
    ];
    const rows = buildShoppingRequirements(plan);
    const tomato = rows.find((r) => r.productId === 'tomate')!;
    expect(tomato.inPantryMilli).toBe(740000);
    expect(tomato.toBuyMilli).toBe(1000000);
    expect(tomato.toBuyBaseMilli).toBe(1000);
    const oil = rows.find((r) => r.productId === 'huile-table')!;
    expect(oil.inPantryMilli).toBe(100000);
    expect(oil.toBuyMilli).toBe(72500);
    expect(oil.toBuyBaseMilli).toBe(73);
    const lentils = rows.find((r) => r.productId === 'lentilles')!;
    expect(lentils.inPantryMilli).toBe(0);
    expect(lentils.toBuyMilli).toBe(900000);
    const garlic = rows.find((r) => r.name === 'ثوم')!;
    expect(garlic.inPantryMilli).toBe(4000);
    expect(garlic.toBuyMilli).toBe(5000);
  });

  it('never goes negative when the pantry exceeds the need', () => {
    const plan = monthPlan();
    plan.pantry = [{ id: 'p1', name: 'عدس', unit: 'g', quantityMilli: 5000000 }];
    const lentils = buildShoppingRequirements(plan).find((r) => r.productId === 'lentilles')!;
    expect(lentils.toBuyMilli).toBe(0);
    expect(lentils.toBuyBaseMilli).toBe(0);
  });

  it('treats an imported recipe with a bogus productId as UNPRICED (invalid mapping), not as the named product', () => {
    const plan = createFamilyLivingPlan('u1', '2026-11');
    plan.recipes = [{
      id: 'community-1', title: 'Test', description: 'Test', baseServings: 2, prepMinutes: 5, origin: 'community',
      ingredients: [{ name: 'tomate', productId: 'not-a-product', quantityMilli: 100000, unit: 'g' }], steps: ['Mix.'],
    }];
    plan.meals = [{ id: 'm1', date: '2026-11-01', slot: 'lunch', recipeId: 'community-1', servings: 2 }];
    expect(validateFamilyLivingPlan(plan, 'u1', '2026-11')).not.toBeNull();
    const rows = buildShoppingRequirements(plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ priced: false, unpricedReason: 'invalid_mapping' });
    expect(rows[0].productId).toBeUndefined();
  });
});

describe('recipe sharing keeps attribution and leaks no household data', () => {
  const imported = {
    title: 'Chakchouka', description: 'Shared', baseServings: 2, prepMinutes: 20, author: 'Amina',
    ingredients: [
      { name: 'tomate', productId: 'tomate', quantityMilli: 300000, unit: 'g' },
      { name: 'œufs', productId: 'fake-product', quantityMilli: 4000, unit: 'piece' },
    ],
    steps: ['Cook.'],
  };

  it('keeps the author, keeps valid productIds and drops invalid ones', () => {
    const recipe = parseCommunityRecipe(imported, 'community-amina')!;
    expect(recipe.author).toBe('Amina');
    expect(recipe.origin).toBe('community');
    expect(recipe.ingredients[0].productId).toBe('tomate');
    expect(recipe.ingredients[1].productId).toBeUndefined();
    // Without the bogus id, the exact name "œufs" still maps by alias.
    expect(resolveProduct(recipe.ingredients[1].name)).toMatchObject({ productId: 'oeufs' });
  });

  it('exports only the recipe: no plan, pantry, shopping list or user identifiers', () => {
    const recipe = parseCommunityRecipe(imported, 'community-amina')!;
    const json = exportCommunityRecipe(recipe);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed).sort()).toEqual(['author', 'baseServings', 'description', 'ingredients', 'prepMinutes', 'steps', 'title']);
    for (const forbidden of ['pantry', 'meals', 'shoppingExtras', 'needs', 'userId', 'u1']) expect(json).not.toContain(forbidden);
    expect(parsed.ingredients[0].productId).toBe('tomate');
  });
});
