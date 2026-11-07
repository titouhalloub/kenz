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

export type HouseholdNeedCategory = 'clothing' | 'cleaning' | 'hygiene' | 'school' | 'transport' | 'health' | 'home' | 'other';

export interface HouseholdNeed {
  id: string;
  category: HouseholdNeedCategory;
  name: string;
  member?: string;
  plannedMinor: number;
  actualMinor: number;
  dueDate?: string;
}

export interface FamilyLivingPlan {
  version: 1;
  userId: string;
  month: string;
  meals: PlannedMeal[];
  pantry: PantryItem[];
  needs: HouseholdNeed[];
  recipes: FamilyRecipe[];
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
const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};
const validUnit = (value: unknown): value is IngredientUnit => value === 'g' || value === 'ml' || value === 'piece';
const validQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validText = (value: unknown, max = 100): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const ingredientAliases: Record<string, string> = {
  'طماطم': 'tomato', tomate: 'tomato', tomates: 'tomato', tomatoes: 'tomato',
  'بصل': 'onion', oignon: 'onion', oignons: 'onion', onions: 'onion',
  'جزر': 'carrot', carotte: 'carrot', carottes: 'carrot', carrots: 'carrot',
  'ثوم': 'garlic', ail: 'garlic', 'زيت': 'oil', huile: 'oil',
  'عدس': 'lentils', lentille: 'lentils', lentilles: 'lentils', 'كسكس': 'couscous',
  'لفت': 'turnip', navet: 'turnip', 'كوسة': 'zucchini', courgette: 'zucchini', courgettes: 'zucchini',
  'حمص': 'chickpeas', 'pois chiche': 'chickpeas', 'pois chiches': 'chickpeas',
  'حمص مطبوخ': 'cooked chickpeas', 'pois chiches cuits': 'cooked chickpeas',
  'بيض': 'eggs', oeuf: 'eggs', oeufs: 'eggs', 'œuf': 'eggs', 'œufs': 'eggs', 'معكرونة': 'pasta', 'pâtes': 'pasta', pate: 'pasta',
  'خيار': 'cucumber', concombre: 'cucumber',
};

export const ingredientKey = (name: string, unit: IngredientUnit) => {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return (ingredientAliases[normalized] || normalized) + '::' + unit;
};

export function createFamilyLivingPlan(userId: string, month: string): FamilyLivingPlan {
  return { version: 1, userId, month, meals: [], pantry: [], needs: [], recipes: [], updatedAt: new Date().toISOString() };
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
  const recipes = new Map<string, FamilyRecipe>([...BUILTIN_FAMILY_RECIPES, ...plan.recipes].map((recipe) => [recipe.id, recipe] as const));
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
      !Array.isArray(row.meals) || !Array.isArray(row.pantry) || (row.needs !== undefined && !Array.isArray(row.needs)) || !Array.isArray(row.recipes) ||
      row.meals.length > 400 || row.pantry.length > 500 || (Array.isArray(row.needs) && row.needs.length > 1000) || row.recipes.length > 500) return null;
  const needs = Array.isArray(row.needs) ? row.needs : [];

  const mealsValid = row.meals.every((meal) => meal && validText(meal.id, 120) &&
    validDate(meal.date) && meal.date.slice(0, 7) === month &&
    (meal.slot === 'breakfast' || meal.slot === 'lunch' || meal.slot === 'dinner') &&
    validText(meal.recipeId, 120) && Number.isInteger(meal.servings) && meal.servings >= 1 && meal.servings <= 40);
  const pantryValid = row.pantry.every((item) => item && validText(item.id, 120) &&
    validText(item.name, 80) && validUnit(item.unit) && validQuantity(item.quantityMilli));
  const needsValid = needs.every((need) => need && validText(need.id, 120) &&
    (need.category === 'clothing' || need.category === 'cleaning' || need.category === 'hygiene' || need.category === 'school' ||
      need.category === 'transport' || need.category === 'health' || need.category === 'home' || need.category === 'other') &&
    validText(need.name, 100) && (need.member === undefined || validText(need.member, 80)) &&
    validQuantity(need.plannedMinor) && validQuantity(need.actualMinor) &&
    (need.dueDate === undefined || (validDate(need.dueDate) && need.dueDate.slice(0, 7) === month)));
  const recipesValid = row.recipes.every((recipe) => recipe && validText(recipe.id, 120) &&
    validText(recipe.title, 100) && validText(recipe.description, 240) &&
    (recipe.author === undefined || validText(recipe.author, 80)) &&
    Number.isInteger(recipe.baseServings) && recipe.baseServings >= 1 && recipe.baseServings <= 40 &&
    Number.isInteger(recipe.prepMinutes) && recipe.prepMinutes >= 0 && recipe.prepMinutes <= 600 &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.length >= 1 && recipe.ingredients.length <= 100 &&
    recipe.ingredients.every((ingredient) => ingredient && validText(ingredient.name, 80) &&
      validUnit(ingredient.unit) && validQuantity(ingredient.quantityMilli) && ingredient.quantityMilli > 0) &&
    Array.isArray(recipe.steps) && recipe.steps.length >= 1 && recipe.steps.length <= 30 &&
    recipe.steps.every((step) => validText(step, 500)) &&
    (recipe.origin === 'community' || recipe.origin === 'builtin'));

  if (!mealsValid || !pantryValid || !needsValid || !recipesValid) return null;
  const recipeIds = new Set([...BUILTIN_FAMILY_RECIPES, ...row.recipes].map((recipe) => recipe.id));
  if (new Set(needs.map((need) => need.id)).size !== needs.length ||
      !Number.isSafeInteger(needs.reduce((sum, need) => sum + need.plannedMinor, 0)) ||
      !Number.isSafeInteger(needs.reduce((sum, need) => sum + need.actualMinor, 0)) ||
      new Set(row.meals.map((meal) => meal.id)).size !== row.meals.length ||
      new Set(row.meals.map((meal) => meal.date + '::' + meal.slot)).size !== row.meals.length ||
      row.meals.some((meal) => !recipeIds.has(meal.recipeId)) ||
      new Set(row.recipes.map((recipe) => recipe.id)).size !== row.recipes.length ||
      row.recipes.some((recipe) => BUILTIN_FAMILY_RECIPES.some((builtin) => builtin.id === recipe.id)) ||
      new Set(row.pantry.map((item) => ingredientKey(item.name, item.unit))).size !== row.pantry.length) return null;
  return { ...row, needs } as FamilyLivingPlan;
}

export function familyLivingStorageKey(userId: string, month: string): string {
  return `kenz_family_living_v1_${encodeURIComponent(userId)}_${month}`;
}

export function parseCommunityRecipe(value: unknown, id: string): FamilyRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FamilyRecipe>;
  if (!validText(id, 120) || !validText(candidate.title, 100) || !validText(candidate.description, 240) ||
      !Number.isInteger(candidate.baseServings) || (candidate.baseServings ?? 0) < 1 ||
      (candidate.baseServings ?? 0) > 40 || !Number.isInteger(candidate.prepMinutes) ||
      (candidate.prepMinutes ?? -1) < 0 || (candidate.prepMinutes ?? 9999) > 600 ||
      !Array.isArray(candidate.ingredients) || candidate.ingredients.length < 1 ||
      candidate.ingredients.length > 100 || !candidate.ingredients.every((item) => item &&
        validText(item.name, 80) && validUnit(item.unit) && validQuantity(item.quantityMilli) && item.quantityMilli > 0) ||
      !Array.isArray(candidate.steps) || candidate.steps.length < 1 || candidate.steps.length > 30 ||
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
