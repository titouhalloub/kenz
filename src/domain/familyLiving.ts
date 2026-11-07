export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export type IngredientUnit = 'g' | 'ml' | 'piece';

export interface RecipeIngredient {
  name: string;
  quantityMilli: number;
  unit: IngredientUnit;
}

export interface FamilyRecipe {
  id: string;
  title: string;
  description: string;
  baseServings: number;
  prepMinutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  origin: 'builtin' | 'community';
  author?: string;
}

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
}

export interface PantryItem {
  id: string;
  name: string;
  unit: IngredientUnit;
  quantityMilli: number;
}

export interface FamilyLivingPlan {
  version: 1;
  userId: string;
  month: string;
  meals: PlannedMeal[];
  pantry: PantryItem[];
  recipes: FamilyRecipe[];
  purchasedKeys: string[];
  updatedAt: string;
}

export interface ShoppingRequirement {
  key: string;
  name: string;
  unit: IngredientUnit;
  requiredMilli: number;
  inPantryMilli: number;
  toBuyMilli: number;
}

export const BUILTIN_FAMILY_RECIPES: FamilyRecipe[] = [
  {
    id: 'dz-lentil-soup', title: 'شوربة العدس', description: 'شوربة دافئة واقتصادية للغداء أو العشاء',
    baseServings: 4, prepMinutes: 35, origin: 'builtin',
    ingredients: [
      { name: 'عدس', quantityMilli: 300000, unit: 'g' }, { name: 'بصل', quantityMilli: 2000, unit: 'piece' },
      { name: 'جزر', quantityMilli: 2000, unit: 'piece' }, { name: 'ثوم', quantityMilli: 2000, unit: 'piece' },
      { name: 'زيت', quantityMilli: 30000, unit: 'ml' }, { name: 'طماطم', quantityMilli: 2000, unit: 'piece' },
    ],
    steps: ['اغسل العدس وقطّع الخضروات.', 'شوّح البصل والجزر والثوم بقليل من الزيت.', 'أضف العدس والطماطم والماء والتوابل واتركه حتى ينضج.', 'اخلط جزءاً من الشوربة إذا رغبت وقدّمها ساخنة.'],
  },
  {
    id: 'dz-couscous-vegetables', title: 'كسكس بالخضار', description: 'طبق عائلي بالخضروات الموسمية',
    baseServings: 4, prepMinutes: 60, origin: 'builtin',
    ingredients: [
      { name: 'كسكس', quantityMilli: 500000, unit: 'g' }, { name: 'جزر', quantityMilli: 3000, unit: 'piece' },
      { name: 'لفت', quantityMilli: 2000, unit: 'piece' }, { name: 'كوسة', quantityMilli: 2000, unit: 'piece' },
      { name: 'حمص', quantityMilli: 150000, unit: 'g' }, { name: 'بصل', quantityMilli: 1000, unit: 'piece' },
      { name: 'طماطم', quantityMilli: 2000, unit: 'piece' },
    ],
    steps: ['حضّر مرق الخضار والحمص حتى يقترب من النضج.', 'فَوّر الكسكس حسب تعليمات العبوة.', 'أضف الكوسة واترك الخضار حتى تنضج.', 'قدّم الكسكس مع المرق والخضار.'],
  },
  {
    id: 'dz-omelette', title: 'عجة البيض بالخضار', description: 'وجبة سريعة للفطور أو العشاء',
    baseServings: 2, prepMinutes: 15, origin: 'builtin',
    ingredients: [
      { name: 'بيض', quantityMilli: 4000, unit: 'piece' }, { name: 'بصل', quantityMilli: 1000, unit: 'piece' },
      { name: 'طماطم', quantityMilli: 1000, unit: 'piece' }, { name: 'زيت', quantityMilli: 15000, unit: 'ml' },
    ],
    steps: ['قطّع البصل والطماطم.', 'اطههما قليلاً في مقلاة.', 'أضف البيض المخفوق واتركه حتى ينضج.'],
  },
  {
    id: 'dz-tomato-pasta', title: 'معكرونة بصلصة الطماطم', description: 'طبق بسيط بمكونات متوفرة غالباً',
    baseServings: 4, prepMinutes: 25, origin: 'builtin',
    ingredients: [
      { name: 'معكرونة', quantityMilli: 400000, unit: 'g' }, { name: 'طماطم', quantityMilli: 4000, unit: 'piece' },
      { name: 'ثوم', quantityMilli: 2000, unit: 'piece' }, { name: 'زيت', quantityMilli: 30000, unit: 'ml' },
      { name: 'بصل', quantityMilli: 1000, unit: 'piece' },
    ],
    steps: ['اسلق المعكرونة في الماء.', 'حضّر صلصة الطماطم مع البصل والثوم والزيت.', 'اخلط المعكرونة مع الصلصة وقدّمها.'],
  },
  {
    id: 'dz-chickpea-salad', title: 'سلطة الحمص', description: 'وجبة خفيفة ومشبعة ويمكن تحضيرها مسبقاً',
    baseServings: 3, prepMinutes: 15, origin: 'builtin',
    ingredients: [
      { name: 'حمص مطبوخ', quantityMilli: 300000, unit: 'g' }, { name: 'طماطم', quantityMilli: 2000, unit: 'piece' },
      { name: 'خيار', quantityMilli: 1000, unit: 'piece' }, { name: 'بصل', quantityMilli: 1000, unit: 'piece' },
      { name: 'زيت', quantityMilli: 20000, unit: 'ml' },
    ],
    steps: ['قطّع الخضروات إلى مكعبات صغيرة.', 'أضف الحمص المطبوخ.', 'تبّل بالزيت والملح والليمون حسب الرغبة.'],
  },
];

const validMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validUnit = (value: unknown): value is IngredientUnit => value === 'g' || value === 'ml' || value === 'piece';
const validQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validText = (value: unknown, max = 100): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export const ingredientKey = (name: string, unit: IngredientUnit) =>
  name.trim().toLocaleLowerCase().replace(/\s+/g, ' ') + '::' + unit;

export function createFamilyLivingPlan(userId: string, month: string): FamilyLivingPlan {
  return { version: 1, userId, month, meals: [], pantry: [], recipes: [], purchasedKeys: [], updatedAt: new Date().toISOString() };
}

export function scaleIngredient(quantityMilli: number, baseServings: number, servings: number): number {
  if (!validQuantity(quantityMilli) || !Number.isInteger(baseServings) || baseServings < 1 ||
      !Number.isInteger(servings) || servings < 1 || servings > 40) throw new RangeError('Invalid recipe quantity or servings.');
  const numerator = BigInt(quantityMilli) * BigInt(servings);
  const denominator = BigInt(baseServings);
  const scaled = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(scaled)) throw new RangeError('Scaled ingredient quantity is too large.');
  return scaled;
}

export function buildShoppingRequirements(plan: FamilyLivingPlan): ShoppingRequirement[] {
  const recipes = new Map([...BUILTIN_FAMILY_RECIPES, ...plan.recipes].map((recipe) => [recipe.id, recipe]));
  const totals = new Map<string, ShoppingRequirement>();
  for (const meal of plan.meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient.name, ingredient.unit);
      const quantity = scaleIngredient(ingredient.quantityMilli, recipe.baseServings, meal.servings);
      const current = totals.get(key);
      if (current) {
        current.requiredMilli += quantity;
        if (!Number.isSafeInteger(current.requiredMilli)) throw new RangeError('Combined shopping quantity is too large.');
      }
      else totals.set(key, { key, name: ingredient.name, unit: ingredient.unit, requiredMilli: quantity, inPantryMilli: 0, toBuyMilli: quantity });
    }
  }
  for (const row of totals.values()) {
    const stock = plan.pantry.find((item) => ingredientKey(item.name, item.unit) === row.key)?.quantityMilli ?? 0;
    row.inPantryMilli = stock;
    row.toBuyMilli = Math.max(0, row.requiredMilli - stock);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validateFamilyLivingPlan(value: unknown, userId: string, month: string): FamilyLivingPlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<FamilyLivingPlan>;
  if (row.version !== 1 || row.userId !== userId || row.month !== month || !validMonth(row.month) ||
      !Array.isArray(row.meals) || !Array.isArray(row.pantry) || !Array.isArray(row.recipes) ||
      !Array.isArray(row.purchasedKeys) || row.meals.length > 400 || row.pantry.length > 500 || row.recipes.length > 500 ||
      !row.meals.every((meal) => meal && validText(meal.id, 120) && typeof meal.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(meal.date) && meal.date.slice(0, 7) === month &&
        (meal.slot === 'breakfast' || meal.slot === 'lunch' || meal.slot === 'dinner') &&
        validText(meal.recipeId, 120) && Number.isInteger(meal.servings) && meal.servings >= 1 && meal.servings <= 40) ||
      !row.pantry.every((item) => item && validText(item.id, 120) && validText(item.name, 80) &&
        validUnit(item.unit) && validQuantity(item.quantityMilli)) ||
      !row.recipes.every((recipe) => recipe && validText(recipe.id, 120) && validText(recipe.title, 100) &&
        validText(recipe.description, 240) && (recipe.author === undefined || validText(recipe.author, 80)) && Number.isInteger(recipe.baseServings) && recipe.baseServings >= 1 &&
        recipe.baseServings <= 40 && Number.isInteger(recipe.prepMinutes) && recipe.prepMinutes >= 0 &&
        Array.isArray(recipe.ingredients) && recipe.ingredients.length <= 100 &&
        recipe.ingredients.every((ingredient) => ingredient && validText(ingredient.name, 80) &&
          validUnit(ingredient.unit) && validQuantity(ingredient.quantityMilli)) &&
        Array.isArray(recipe.steps) && recipe.steps.length <= 30 &&
        recipe.steps.every((step) => validText(step, 500)) &&
        (recipe.origin === 'community' || recipe.origin === 'builtin')) ||
      !row.purchasedKeys.every((key) => validText(key, 180))) return null;

  const recipeIds = new Set([...BUILTIN_FAMILY_RECIPES, ...row.recipes].map((recipe) => recipe.id));
  if (new Set(row.meals.map((meal) => meal.id)).size !== row.meals.length ||
      row.meals.some((meal) => !recipeIds.has(meal.recipeId)) ||
      new Set(row.recipes.map((recipe) => recipe.id)).size !== row.recipes.length ||
      row.recipes.some((recipe) => BUILTIN_FAMILY_RECIPES.some((builtin) => builtin.id === recipe.id)) ||
      new Set(row.pantry.map((item) => ingredientKey(item.name, item.unit))).size !== row.pantry.length) return null;
  return row as FamilyLivingPlan;
}

export function familyLivingStorageKey(userId: string, month: string): string {
  return `kenz_family_living_v1_${encodeURIComponent(userId)}_${month}`;
}

export function parseCommunityRecipe(value: unknown, id: string): FamilyRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FamilyRecipe>;
  if (!validText(candidate.title, 100) || !validText(candidate.description, 240) ||
      !Number.isInteger(candidate.baseServings) || (candidate.baseServings ?? 0) < 1 ||
      (candidate.baseServings ?? 0) > 40 || !Number.isInteger(candidate.prepMinutes) ||
      (candidate.prepMinutes ?? -1) < 0 || (candidate.prepMinutes ?? 9999) > 600 ||
      !Array.isArray(candidate.ingredients) || candidate.ingredients.length < 1 ||
      candidate.ingredients.length > 100 || !candidate.ingredients.every((item) => item &&
        validText(item.name, 80) && validUnit(item.unit) && validQuantity(item.quantityMilli)) ||
      !Array.isArray(candidate.steps) || candidate.steps.length > 30 ||
      !candidate.steps.every((step) => validText(step, 500))) return null;
  return {
    id, title: candidate.title.trim(), description: candidate.description.trim(),
    baseServings: candidate.baseServings!, prepMinutes: candidate.prepMinutes!,
    ingredients: candidate.ingredients.map((item) => ({ name: item.name.trim(), quantityMilli: item.quantityMilli, unit: item.unit })),
    steps: candidate.steps.map((step) => step.trim()), origin: 'community',
    ...(candidate.author && validText(candidate.author, 80) ? { author: candidate.author.trim() } : {}),
  };
}

export function exportCommunityRecipe(recipe: FamilyRecipe): string {
  return JSON.stringify({
    title: recipe.title, description: recipe.description, baseServings: recipe.baseServings,
    prepMinutes: recipe.prepMinutes, ingredients: recipe.ingredients, steps: recipe.steps,
    ...(recipe.author ? { author: recipe.author } : {}),
  }, null, 2);
}
