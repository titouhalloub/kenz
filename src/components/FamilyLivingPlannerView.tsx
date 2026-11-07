import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChefHat, Package, Plus, Trash2, Download, Upload, ShoppingBasket, ClipboardList } from 'lucide-react';
import type { UserProfile } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import {
  BUILTIN_FAMILY_RECIPES, buildShoppingRequirements, createFamilyLivingPlan,
  exportCommunityRecipe, familyLivingStorageKey, ingredientKey, parseCommunityRecipe,
  validateFamilyLivingPlan, type FamilyLivingPlan, type FamilyRecipe, type IngredientUnit,
  type MealSlot, type HouseholdNeedCategory, type ClothingSeason, type ShoppingExtraCategory,
} from '../domain/familyLiving';

interface Props { profile: UserProfile; month: string; householdSize: number; }
type Section = 'meals' | 'shopping' | 'pantry' | 'recipes' | 'needs';

const tr = (profile: UserProfile, fr: string, ar: string, en: string) =>
  profile.locale === 'ar' ? ar : profile.locale === 'en' ? en : fr;
const monthFirstDay = (month: string) => `${month}-01`;
const isValidCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};
const monthLastDay = (month: string) => { const [year, monthNumber] = month.split('-').map(Number); return `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`; };
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const parseMoneyMinor = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const moneyField = (minor: number) => (minor / 100).toFixed(2);
const parseQuantityMilli = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) return 0;
  const milli = Math.round(parsed * 1000);
  return Number.isSafeInteger(milli) ? milli : 0;
};
const formatQuantity = (milli: number, unit: IngredientUnit, locale: string) => {
  const value = milli / 1000;
  if (unit === 'g' && value >= 1000) return `${new Intl.NumberFormat(locale).format(value / 1000)} kg`;
  if (unit === 'ml' && value >= 1000) return `${new Intl.NumberFormat(locale).format(value / 1000)} L`;
  const label = unit === 'g' ? 'g' : unit === 'ml' ? 'ml' : locale.startsWith('ar') ? 'حبة' : locale.startsWith('fr') ? 'pièce(s)' : 'piece(s)';
  return `${new Intl.NumberFormat(locale).format(value)} ${label}`;
};

const readLivingPlan = (userId: string, month: string): FamilyLivingPlan => {
  const fallback = createFamilyLivingPlan(userId, month);
  try {
    const raw = localStorage.getItem(familyLivingStorageKey(userId, month));
    const monthly = raw ? (validateFamilyLivingPlan(JSON.parse(raw), userId, month) || fallback) : fallback;
    try {
      const libraryRaw = localStorage.getItem('kenz_family_recipe_library_v1_' + encodeURIComponent(userId));
      const library = libraryRaw ? JSON.parse(libraryRaw) : [];
      if (Array.isArray(library)) {
        const imported = library.map((item) => item && typeof item.id === 'string' ? parseCommunityRecipe(item, item.id) : null).filter((item): item is FamilyRecipe => !!item);
        const combined = [...monthly.recipes, ...imported];
        monthly.recipes = [...new Map<string, FamilyRecipe>(combined.map((recipe) => [recipe.id, recipe] as const)).values()];
      }
    } catch { /* Keep the validated monthly collection if the shared library is damaged. */ }
    return monthly;
  } catch { return fallback; }
};

export const FamilyLivingPlannerView: React.FC<Props> = ({ profile, month, householdSize }) => {
  const [plan, setPlan] = useState(() => readLivingPlan(profile.id, month));
  const [section, setSection] = useState<Section>('meals');
  const [mealDate, setMealDate] = useState(monthFirstDay(month));
  const [mealSlot, setMealSlot] = useState<MealSlot>('lunch');
  const [recipeId, setRecipeId] = useState(BUILTIN_FAMILY_RECIPES[0].id);
  const [servings, setServings] = useState(String(Math.max(1, householdSize)));
  const [status, setStatus] = useState('');
  const [pantryName, setPantryName] = useState('');
  const [pantryUnit, setPantryUnit] = useState<IngredientUnit>('g');
  const [pantryQuantity, setPantryQuantity] = useState('');
  const [shareText, setShareText] = useState('');
  const [importText, setImportText] = useState('');
  const [needCategory, setNeedCategory] = useState<HouseholdNeedCategory>('clothing');
  const [needName, setNeedName] = useState('');
  const [needMember, setNeedMember] = useState('');
  const [needPlanned, setNeedPlanned] = useState('');
  const [needDate, setNeedDate] = useState('');
  const [needSeason, setNeedSeason] = useState<ClothingSeason>('all');
  const [needSize, setNeedSize] = useState('');
  const [extraName, setExtraName] = useState('');
  const [extraQuantity, setExtraQuantity] = useState('');
  const [extraUnit, setExtraUnit] = useState<IngredientUnit>('piece');
  const [extraCategory, setExtraCategory] = useState<ShoppingExtraCategory>('grocery');

  useEffect(() => {
    setPlan(readLivingPlan(profile.id, month));
    setMealDate(monthFirstDay(month));
    setNeedDate('');
    setStatus('');
  }, [profile.id, month]);

  useEffect(() => {
    setServings(String(Math.max(1, householdSize)));
  }, [householdSize]);

  useEffect(() => {
    if (plan.userId !== profile.id || plan.month !== month) return;
    try {
      localStorage.setItem(familyLivingStorageKey(profile.id, month), JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }));
      localStorage.setItem('kenz_family_recipe_library_v1_' + encodeURIComponent(profile.id), JSON.stringify(plan.recipes));
    } catch { setStatus(tr(profile, 'Stockage local indisponible.', 'التخزين المحلي غير متاح.', 'Local storage is unavailable.')); }
  }, [plan, profile.id, month, profile.locale]);

  const recipes = useMemo(() => [...BUILTIN_FAMILY_RECIPES, ...plan.recipes], [plan.recipes]);
  const recipeMap = useMemo(() => new Map<string, FamilyRecipe>(recipes.map((recipe) => [recipe.id, recipe] as const)), [recipes]);
  const requirements = useMemo(() => buildShoppingRequirements(plan), [plan]);
  const selectedRecipe = recipeMap.get(recipeId) || recipes[0];
  const plannedMeals = [...plan.meals].sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  const updatePlan = (updater: (current: FamilyLivingPlan) => FamilyLivingPlan) => {
    const next = updater(plan);
    setPlan({ ...next, updatedAt: new Date().toISOString() });
    setStatus('');
  };

  const suggestWeek = () => {
    if (!isValidCalendarDate(mealDate) || mealDate.slice(0, 7) !== month) {
      setStatus(tr(profile, 'Choisissez une date valide dans le mois sélectionné.', 'اختر تاريخاً صحيحاً ضمن الشهر المحدد.', 'Choose a valid date in the selected month.'));
      return;
    }
    let added = 0;
    updatePlan((current) => {
      const meals = [...current.meals];
      const start = new Date(mealDate + 'T12:00:00');
      const householdServings = Math.max(1, Math.min(40, householdSize));
      for (let day = 0; day < 7 && meals.length < 400; day++) {
        const date = new Date(start);
        date.setDate(start.getDate() + day);
        if (date.getMonth() + 1 !== Number(month.slice(5, 7)) || date.getFullYear() !== Number(month.slice(0, 4))) break;
        const dateKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        (['breakfast', 'lunch', 'dinner'] as MealSlot[]).forEach((slot, slotIndex) => {
          if (meals.some((meal) => meal.date === dateKey && meal.slot === slot)) return;
          if (meals.length >= 400) return;
          const recipe = slot === 'breakfast' ? BUILTIN_FAMILY_RECIPES.find((item) => item.id === 'dz-omelette')! : BUILTIN_FAMILY_RECIPES[(day * 2 + slotIndex) % BUILTIN_FAMILY_RECIPES.length];
          meals.push({ id: makeId('meal'), date: dateKey, slot, recipeId: recipe.id, servings: householdServings });
          added++;
        });
      }
      return { ...current, meals };
    });
    setStatus(added ? tr(profile, added + ' repas suggérés ont été ajoutés. Vous pouvez les modifier ou les supprimer.', 'تمت إضافة ' + added + ' وجبة مقترحة. يمكنك تعديلها أو حذفها.', added + ' suggested meals added. You can edit or remove them.') : tr(profile, 'Tous les repas de cette semaine sont déjà planifiés.', 'وجبات هذا الأسبوع مبرمجة بالفعل.', 'All meals for this week are already planned.'));
  };

  const addMeal = () => {
    const count = Number(servings);
    if (plan.meals.length >= 400) { setStatus(tr(profile, 'Limite de repas atteinte pour ce mois.', 'تم بلوغ الحد الأقصى للوجبات لهذا الشهر.', 'The monthly meal limit has been reached.')); return; }
    if (!isValidCalendarDate(mealDate) || mealDate.slice(0, 7) !== month ||
        !Number.isInteger(count) || count < 1 || count > 40 || !selectedRecipe) {
      setStatus(tr(profile, 'Vérifiez la date et le nombre de portions.', 'تحقق من التاريخ وعدد الحصص.', 'Check the date and serving count.'));
      return;
    }
    if (plan.meals.some((meal) => meal.date === mealDate && meal.slot === mealSlot)) {
      setStatus(tr(profile, 'Ce repas est déjà planifié. Supprimez-le avant de le remplacer.', 'هذه الوجبة مبرمجة مسبقاً. احذفها قبل استبدالها.', 'A meal is already planned for this slot. Remove it before replacing it.'));
      return;
    }
    updatePlan((current) => ({ ...current, meals: [...current.meals, {
      id: makeId('meal'), date: mealDate, slot: mealSlot, recipeId: selectedRecipe.id, servings: count,
    }] }));
  };

  const addPantryItem = () => {
    const name = pantryName.trim();
    const quantityMilli = parseQuantityMilli(pantryQuantity);
    if (!name || name.length > 80 || !quantityMilli) {
      setStatus(tr(profile, 'Saisissez un nom et une quantité valides.', 'أدخل اسماً وكمية صحيحة.', 'Enter a valid item name and quantity.'));
      return;
    }
    const existingStock = plan.pantry.find((item) => ingredientKey(item.name, item.unit) === ingredientKey(name, pantryUnit));
    if (!existingStock && plan.pantry.length >= 500) { setStatus(tr(profile, 'Limite de stock atteinte.', 'تم بلوغ حد عناصر المخزون.', 'Pantry item limit reached.')); return; }
    if (existingStock && !Number.isSafeInteger(existingStock.quantityMilli + quantityMilli)) {
      setStatus(tr(profile, 'Quantité totale trop élevée.', 'الكمية الإجمالية كبيرة جداً.', 'Combined quantity is too large.'));
      return;
    }
    updatePlan((current) => {
      const key = ingredientKey(name, pantryUnit);
      const existing = current.pantry.find((item) => ingredientKey(item.name, item.unit) === key);
      if (existing) {
        const total = existing.quantityMilli + quantityMilli;
        return { ...current, pantry: current.pantry.map((item) => item.id === existing.id ? { ...item, quantityMilli: total } : item) };
      }
      return { ...current, pantry: [...current.pantry, { id: makeId('stock'), name, unit: pantryUnit, quantityMilli }] };
    });
    setPantryName(''); setPantryQuantity('');
  };

  const addShoppingExtra = () => {
    const name = extraName.trim();
    const quantityMilli = parseQuantityMilli(extraQuantity);
    if (!name || name.length > 80 || !quantityMilli || plan.shoppingExtras.length >= 500) {
      setStatus(tr(profile, 'Vérifiez le produit et la quantité.', 'تحقق من المنتج والكمية.', 'Check the item and quantity.'));
      return;
    }
    updatePlan((current) => ({ ...current, shoppingExtras: [...current.shoppingExtras, {
      id: makeId('shopping'), name, unit: extraUnit, quantityMilli, category: extraCategory,
    }] }));
    setExtraName(''); setExtraQuantity('');
  };

  const addNeed = () => {
    const name = needName.trim();
    const plannedMinor = parseMoneyMinor(needPlanned);
    if (!name || name.length > 100 || plannedMinor === null || (needMember.trim().length > 80) || (needCategory === 'clothing' && needSize.trim().length > 40) || plan.needs.length >= 1000 || (needDate && (!isValidCalendarDate(needDate) || needDate.slice(0, 7) !== month))) {
      setStatus(tr(profile, 'Vérifiez le nom, le montant et la date.', 'تحقق من الاسم والمبلغ والتاريخ.', 'Check the name, amount and date.'));
      return;
    }
    const total = plan.needs.reduce((sum, item) => sum + item.plannedMinor, 0) + plannedMinor;
    if (!Number.isSafeInteger(total)) {
      setStatus(tr(profile, 'Le total des besoins est trop élevé.', 'إجمالي الاحتياجات كبير جداً.', 'The needs total is too large.'));
      return;
    }
    updatePlan((current) => ({ ...current, needs: [...current.needs, {
      id: makeId('need'), category: needCategory, name, ...(needMember.trim() ? { member: needMember.trim() } : {}),
      ...(needCategory === 'clothing' ? { season: needSeason, ...(needSize.trim() ? { size: needSize.trim() } : {}) } : {}),
      plannedMinor, actualMinor: 0, ...(needDate ? { dueDate: needDate } : {}),
    }] }));
    setNeedName(''); setNeedMember(''); setNeedPlanned(''); setNeedDate(''); setNeedSeason('all'); setNeedSize('');
  };

  const updateNeedActual = (id: string, value: string, original: number) => {
    const amount = parseMoneyMinor(value);
    if (amount === null) return original;
    const otherTotal = plan.needs.filter((item) => item.id !== id).reduce((sum, item) => sum + item.actualMinor, 0);
    if (!Number.isSafeInteger(otherTotal + amount)) return original;
    updatePlan((current) => ({ ...current, needs: current.needs.map((item) => item.id === id ? { ...item, actualMinor: amount } : item) }));
    return amount;
  };

  const importRecipe = () => {
    try {
      if (importText.length > 100000 || plan.recipes.length >= 500) throw new Error('too large');
      const parsed = JSON.parse(importText);
      const recipe = parseCommunityRecipe(parsed, makeId('community-recipe'));
      if (!recipe) throw new Error('invalid');
      updatePlan((current) => ({ ...current, recipes: [...current.recipes, recipe] }));
      setRecipeId(recipe.id); setImportText('');
      setStatus(tr(profile, 'Recette importée dans votre collection privée.', 'تم استيراد الوصفة إلى مجموعتك الخاصة.', 'Recipe imported into your private collection.'));
    } catch {
      setStatus(tr(profile, 'Format invalide. Utilisez le JSON partagé par un autre membre.', 'الصيغة غير صحيحة. استخدم JSON المشارك من عضو آخر.', 'Invalid format. Paste the JSON recipe shared by another member.'));
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(tr(profile, 'Copié dans le presse-papiers.', 'تم النسخ.', 'Copied to clipboard.'));
    } catch {
      setStatus(tr(profile, 'Sélectionnez le texte pour le copier manuellement.', 'حدد النص لنسخه يدوياً.', 'Select the text and copy it manually.'));
    }
  };

  const slotLabel = (slot: MealSlot) => slot === 'breakfast'
    ? tr(profile, 'Petit-déjeuner', 'الفطور', 'Breakfast')
    : slot === 'lunch' ? tr(profile, 'Déjeuner', 'الغداء', 'Lunch') : tr(profile, 'Dîner', 'العشاء', 'Dinner');
  const ingredientCopy: Record<string, { fr: string; en: string }> = {
    tomato: { fr: 'Tomate', en: 'Tomato' }, onion: { fr: 'Oignon', en: 'Onion' },
    carrot: { fr: 'Carotte', en: 'Carrot' }, garlic: { fr: 'Ail', en: 'Garlic' },
    oil: { fr: 'Huile', en: 'Oil' }, lentils: { fr: 'Lentilles', en: 'Lentils' },
    couscous: { fr: 'Couscous', en: 'Couscous' }, turnip: { fr: 'Navet', en: 'Turnip' },
    zucchini: { fr: 'Courgette', en: 'Zucchini' }, chickpeas: { fr: 'Pois chiches', en: 'Chickpeas' },
    'cooked chickpeas': { fr: 'Pois chiches cuits', en: 'Cooked chickpeas' },
    eggs: { fr: 'Œufs', en: 'Eggs' }, pasta: { fr: 'Pâtes', en: 'Pasta' }, cucumber: { fr: 'Concombre', en: 'Cucumber' },
  };
  const ingredientLabel = (name: string) => {
    if (profile.locale === 'ar') return name;
    const key = ingredientKey(name, 'piece').split('::')[0];
    return ingredientCopy[key]?.[profile.locale] || name;
  };
  const translatedSteps: Record<string, { fr: string[]; en: string[] }> = {
    'dz-lentil-soup': {
      fr: ['Rincez les lentilles et coupez les légumes.', 'Faites revenir l’oignon, la carotte et l’ail avec un peu d’huile.', 'Ajoutez les lentilles, les tomates, l’eau et les épices. Laissez cuire.', 'Mixez une partie de la soupe si vous le souhaitez, puis servez chaud.'],
      en: ['Rinse the lentils and chop the vegetables.', 'Soften the onion, carrot and garlic in a little oil.', 'Add lentils, tomatoes, water and spices; simmer until tender.', 'Blend part of the soup if you like, then serve hot.'],
    },
    'dz-couscous-vegetables': {
      fr: ['Faites cuire le bouillon avec les pois chiches et les légumes les plus fermes.', 'Faites cuire le couscous à la vapeur selon les instructions du paquet.', 'Ajoutez la courgette et poursuivez la cuisson jusqu’à ce que les légumes soient tendres.', 'Servez le couscous avec le bouillon et les légumes.'],
      en: ['Simmer the broth with chickpeas and the firmer vegetables.', 'Steam the couscous according to the package instructions.', 'Add zucchini and cook until the vegetables are tender.', 'Serve the couscous with the broth and vegetables.'],
    },
    'dz-omelette': {
      fr: ['Coupez l’oignon et la tomate.', 'Faites-les revenir brièvement dans une poêle.', 'Ajoutez les œufs battus et faites cuire jusqu’à ce qu’ils soient pris.'],
      en: ['Chop the onion and tomato.', 'Cook them briefly in a pan.', 'Add the beaten eggs and cook until set.'],
    },
    'dz-tomato-pasta': {
      fr: ['Faites cuire les pâtes dans l’eau.', 'Préparez une sauce avec les tomates, l’oignon, l’ail et l’huile.', 'Mélangez les pâtes avec la sauce et servez.'],
      en: ['Boil the pasta in water.', 'Make a sauce with tomatoes, onion, garlic and oil.', 'Toss the pasta with the sauce and serve.'],
    },
    'dz-chickpea-salad': {
      fr: ['Coupez les légumes en petits dés.', 'Ajoutez les pois chiches cuits.', 'Assaisonnez avec de l’huile, du sel et du citron selon votre goût.'],
      en: ['Dice the vegetables.', 'Add the cooked chickpeas.', 'Season with oil, salt and lemon to taste.'],
    },
  };
  const recipeSteps = (recipe: FamilyRecipe) => profile.locale === 'ar' ? recipe.steps : translatedSteps[recipe.id]?.[profile.locale] || recipe.steps;
  const recipeCopy: Record<string, { fr: string; en: string; descriptionFr: string; descriptionEn: string }> = {
    'dz-lentil-soup': { fr: 'Soupe de lentilles', en: 'Lentil soup', descriptionFr: 'Soupe chaude et économique pour le déjeuner ou le dîner', descriptionEn: 'A warm, budget-friendly lunch or dinner soup' },
    'dz-couscous-vegetables': { fr: 'Couscous aux légumes', en: 'Vegetable couscous', descriptionFr: 'Plat familial aux légumes de saison', descriptionEn: 'Family couscous with seasonal vegetables' },
    'dz-omelette': { fr: 'Omelette aux légumes', en: 'Vegetable omelette', descriptionFr: 'Repas rapide pour le petit-déjeuner ou le dîner', descriptionEn: 'A quick breakfast or dinner' },
    'dz-tomato-pasta': { fr: 'Pâtes à la tomate', en: 'Tomato pasta', descriptionFr: 'Plat simple avec des ingrédients courants', descriptionEn: 'A simple dish made with everyday ingredients' },
    'dz-chickpea-salad': { fr: 'Salade de pois chiches', en: 'Chickpea salad', descriptionFr: 'Repas léger et nourrissant, préparé à l’avance', descriptionEn: 'A light, filling meal that can be prepared ahead' },
  };
  const recipeTitle = (recipe: FamilyRecipe) => profile.locale === 'ar' ? recipe.title : recipeCopy[recipe.id]?.[profile.locale] || recipe.title;
  const recipeDescription = (recipe: FamilyRecipe) => profile.locale === 'ar' ? recipe.description : recipeCopy[recipe.id]?.[profile.locale === 'fr' ? 'descriptionFr' : 'descriptionEn'] || recipe.description;

  return (
    <section className="kenz-family-living space-y-4" dir={profile.locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="kenz-family-hero">
        <div className="kenz-family-hero-icon"><ChefHat /></div>
        <div className="min-w-0 flex-1">
          <span className="kenz-eyebrow">KENZ · FAMILY LIFE</span>
          <h2>{tr(profile, 'Repas, courses & réserves', 'الوجبات والمشتريات والمخزون', 'Meals, groceries & pantry')}</h2>
          <p>{tr(profile, 'Planifiez les repas et préparez une liste de courses sans doublons.', 'خطط الوجبات وجهّز قائمة مشتريات دون تكرار.', 'Plan meals and build a shopping list without duplicates.')}</p>
        </div>
      </header>

      <div className="kenz-family-subtabs kenz-family-section-tabs">
        {([
          ['meals', CalendarDays, tr(profile, 'Repas', 'الوجبات', 'Meals')],
          ['shopping', ShoppingBasket, tr(profile, 'Courses', 'المشتريات', 'Shopping')],
          ['pantry', Package, tr(profile, 'Réserves', 'المخزون', 'Pantry')],
          ['recipes', ChefHat, tr(profile, 'Recettes', 'الوصفات', 'Recipes')],
          ['needs', ClipboardList, tr(profile, 'Besoins', 'الاحتياجات', 'Needs')],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setSection(id)} className={section === id ? 'active' : ''}><Icon />{label}</button>
        ))}
      </div>

      {status && <p role="status" className="kenz-family-inline-status">{status}</p>}

      {section === 'meals' && <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{tr(profile, 'CALENDRIER', 'التقويم', 'CALENDAR')}</span><h3>{tr(profile, 'Programmer un repas', 'برمجة وجبة', 'Plan a meal')}</h3></div><span className="text-xs text-slate-500">{month}</span></div>
        <div className="grid grid-cols-2 gap-2">
          <label>{tr(profile, 'Date', 'التاريخ', 'Date')}<input type="date" min={monthFirstDay(month)} max={monthLastDay(month)} value={mealDate} onChange={(e) => setMealDate(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label>{tr(profile, 'Repas', 'الوجبة', 'Meal')}<select value={mealSlot} onChange={(e) => setMealSlot(e.target.value as MealSlot)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"><option value="breakfast">{slotLabel('breakfast')}</option><option value="lunch">{slotLabel('lunch')}</option><option value="dinner">{slotLabel('dinner')}</option></select></label>
          <label className="col-span-2">{tr(profile, 'Recette', 'الوصفة', 'Recipe')}<select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm">{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipeTitle(recipe)}</option>)}</select></label>
          <label className="col-span-2">{tr(profile, 'Nombre de portions', 'عدد الحصص', 'Servings')}<input type="number" min="1" max="40" value={servings} onChange={(e) => setServings(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
        </div>
        {selectedRecipe && <div className="rounded-xl bg-violet-50 p-3">
          <strong className="text-sm text-violet-950">{recipeTitle(selectedRecipe)}</strong>
          <p className="mt-1 text-xs text-violet-800">{recipeDescription(selectedRecipe)} · {selectedRecipe.prepMinutes} {tr(profile, 'min', 'د', 'min')}</p>
          <p className="mt-2 text-xs font-semibold text-violet-900">{tr(profile, 'Ingrédients pour', 'المكونات لـ', 'Ingredients for')} {servings || householdSize} {tr(profile, 'personnes', 'أشخاص', 'people')}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-violet-900">{selectedRecipe.ingredients.map((ingredient) => <li key={ingredient.name + ingredient.unit}>• {ingredientLabel(ingredient.name)}: {formatQuantity(Math.round(ingredient.quantityMilli * Math.max(1, Number(servings) || householdSize) / selectedRecipe.baseServings), ingredient.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US')}</li>)}</ul>
          <ol className="mt-3 list-decimal space-y-1 ps-4 text-xs text-violet-900">{recipeSteps(selectedRecipe).map((step, index) => <li key={index}>{step}</li>)}</ol>
        </div>}
        <button onClick={addMeal} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white"><Plus className="inline mr-2 h-4 w-4" />{tr(profile, 'Ajouter au calendrier', 'إضافة إلى التقويم', 'Add to calendar')}</button>
        <button onClick={suggestWeek} className="w-full min-h-10 rounded-xl border border-violet-200 px-4 text-xs font-bold text-violet-700">{tr(profile, 'Suggérer les repas de 7 jours', 'اقترح وجبات 7 أيام', 'Suggest 7 days of meals')}</button>
        <div className="pt-2">
          <h3 className="mb-2 text-sm font-bold">{tr(profile, 'Repas prévus ce mois', 'وجبات هذا الشهر', 'Meals planned this month')} ({plannedMeals.length})</h3>
          {plannedMeals.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{tr(profile, 'Aucun repas planifié. Commencez par ajouter une recette.', 'لا توجد وجبات مبرمجة. ابدأ بإضافة وصفة.', 'No meals planned yet. Add a recipe to get started.')}</p> : <div className="space-y-2">{plannedMeals.map((meal) => {
            const recipe = recipeMap.get(meal.recipeId);
            return <article key={meal.id} className="flex items-center gap-3 rounded-xl border border-violet-100 p-3">
              <div className="min-w-0 flex-1"><strong className="block text-xs">{recipe ? recipeTitle(recipe) : meal.recipeId}</strong><span className="text-[10px] text-slate-500">{meal.date} · {slotLabel(meal.slot)} · {meal.servings} {tr(profile, 'portions', 'حصص', 'servings')}</span></div>
              <button aria-label={tr(profile, 'Supprimer le repas', 'حذف الوجبة', 'Remove meal')} onClick={() => updatePlan((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }))} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </article>;
          })}</div>}
        </div>
      </div>}

      {section === 'shopping' && <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{tr(profile, 'LISTE AUTOMATIQUE', 'قائمة تلقائية', 'AUTO LIST')}</span><h3>{tr(profile, 'À acheter', 'قائمة المشتريات', 'Shopping list')}</h3></div><span className="text-xs text-slate-500">{requirements.filter((row) => row.toBuyMilli > 0).length} {tr(profile, 'articles', 'مواد', 'items')}</span></div>
        <p className="text-xs text-slate-500">{tr(profile, 'Les ingrédients des repas sont regroupés. Le stock enregistré est déduit automatiquement. Les quantités restent modifiables dans les réserves.', 'تُجمع مكونات الوجبات ويُخصم المخزون المسجل تلقائياً. يمكن تعديل الكميات من قسم المخزون.', 'Meal ingredients are combined and saved pantry stock is deducted automatically. Adjust stock in the pantry section.')}</p>
        <div className="rounded-xl bg-violet-50 p-3 space-y-2">
          <h4 className="text-xs font-bold text-violet-950">{tr(profile, 'Ajouter un produit hors recette', 'إضافة منتج خارج الوصفات', 'Add a non-recipe item')}</h4>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2">{tr(profile, 'Produit', 'المنتج', 'Item')}<input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder={tr(profile, 'Ex. lessive, savon, papier…', 'مثلاً مسحوق غسيل، صابون، ورق…', 'e.g. detergent, soap, paper…')} className="mt-1 w-full h-10 rounded-lg border px-3 text-xs" /></label>
            <label>{tr(profile, 'Quantité', 'الكمية', 'Quantity')}<input inputMode="decimal" value={extraQuantity} onChange={(e) => setExtraQuantity(e.target.value)} placeholder="0" className="mt-1 w-full h-10 rounded-lg border px-3 text-xs" /></label>
            <label>{tr(profile, 'Unité', 'الوحدة', 'Unit')}<select value={extraUnit} onChange={(e) => setExtraUnit(e.target.value as IngredientUnit)} className="mt-1 w-full h-10 rounded-lg border px-3 text-xs"><option value="piece">{tr(profile, 'pièce', 'حبة', 'piece')}</option><option value="g">g</option><option value="ml">ml</option></select></label>
            <label className="col-span-2">{tr(profile, 'Type', 'النوع', 'Type')}<select value={extraCategory} onChange={(e) => setExtraCategory(e.target.value as ShoppingExtraCategory)} className="mt-1 w-full h-10 rounded-lg border px-3 text-xs"><option value="grocery">{tr(profile, 'Épicerie', 'مواد غذائية', 'Groceries')}</option><option value="cleaning">{tr(profile, 'Nettoyage', 'تنظيف', 'Cleaning')}</option><option value="hygiene">{tr(profile, 'Hygiène', 'نظافة شخصية', 'Hygiene')}</option><option value="other">{tr(profile, 'Autre', 'أخرى', 'Other')}</option></select></label>
          </div>
          <button onClick={addShoppingExtra} className="w-full min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white"><Plus className="inline mr-1 h-4 w-4" />{tr(profile, 'Ajouter à la liste', 'إضافة إلى القائمة', 'Add to list')}</button>
          {plan.shoppingExtras.length > 0 && <div className="space-y-1 pt-1">{plan.shoppingExtras.map((extra) => <div key={extra.id} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{extra.name} · {formatQuantity(extra.quantityMilli, extra.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US')}</span><button aria-label={tr(profile, 'Supprimer', 'حذف', 'Delete')} onClick={() => updatePlan((current) => ({ ...current, shoppingExtras: current.shoppingExtras.filter((item) => item.id !== extra.id) }))} className="p-1 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
        </div>
        {requirements.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{tr(profile, 'Planifiez d’abord quelques repas pour générer votre liste.', 'برمج بعض الوجبات أولاً لإنشاء القائمة.', 'Plan a few meals first to generate your list.')}</p> : <div className="space-y-2">{requirements.map((item) => <article key={item.key} className="flex items-center gap-3 rounded-xl border border-violet-100 p-3">
          <div className="min-w-0 flex-1"><strong className="block text-xs">{ingredientLabel(item.name)}</strong><span className="text-[10px] text-slate-500">{tr(profile, 'Nécessaire', 'المطلوب', 'Needed')}: {formatQuantity(item.requiredMilli, item.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US')} · {tr(profile, 'Stock', 'المخزون', 'Stock')}: {formatQuantity(item.inPantryMilli, item.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US')}</span></div>
          <strong className="text-xs text-violet-800">{item.toBuyMilli > 0 ? formatQuantity(item.toBuyMilli, item.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US') : tr(profile, 'OK', 'متوفر', 'In stock')}</strong>
        </article>)}</div>}
        <p className="text-[10px] text-slate-500">{tr(profile, 'Les prix ne sont pas inventés : les estimations seront ajoutées avec leur source et leur date.', 'لا يتم اختلاق الأسعار؛ ستضاف التقديرات مع مصدرها وتاريخها.', 'Prices are not fabricated; estimates will be added with their source and date.')}</p>
      </div>}

      {section === 'pantry' && <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{tr(profile, 'INVENTAIRE', 'الجرد', 'INVENTORY')}</span><h3>{tr(profile, 'Réserves à la maison', 'المخزون المنزلي', 'Home pantry')}</h3></div></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2">{tr(profile, 'Produit', 'المنتج', 'Item')}<input value={pantryName} onChange={(e) => setPantryName(e.target.value)} placeholder={tr(profile, 'Ex. riz, huile, œufs…', 'مثلاً أرز، زيت، بيض…', 'e.g. rice, oil, eggs…')} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label>{tr(profile, 'Quantité', 'الكمية', 'Quantity')}<input inputMode="decimal" value={pantryQuantity} onChange={(e) => setPantryQuantity(e.target.value)} placeholder="0" className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label>{tr(profile, 'Unité', 'الوحدة', 'Unit')}<select value={pantryUnit} onChange={(e) => setPantryUnit(e.target.value as IngredientUnit)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"><option value="g">g</option><option value="ml">ml</option><option value="piece">{tr(profile, 'pièce', 'حبة', 'piece')}</option></select></label>
        </div>
        <button onClick={addPantryItem} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white"><Plus className="inline mr-2 h-4 w-4" />{tr(profile, 'Ajouter au stock', 'إضافة للمخزون', 'Add to pantry')}</button>
        {plan.pantry.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{tr(profile, 'Ajoutez les produits déjà disponibles à la maison.', 'أضف المنتجات المتوفرة في المنزل.', 'Add the items you already have at home.')}</p> : <div className="space-y-2">{plan.pantry.map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl border border-violet-100 p-3"><div className="min-w-0 flex-1"><strong className="block text-xs">{item.name}</strong><span className="text-[10px] text-slate-500">{formatQuantity(item.quantityMilli, item.unit, profile.locale === 'ar' ? 'ar-DZ' : profile.locale === 'fr' ? 'fr-DZ' : 'en-US')}</span></div><button aria-label={tr(profile, 'Supprimer', 'حذف', 'Delete')} onClick={() => updatePlan((current) => ({ ...current, pantry: current.pantry.filter((row) => row.id !== item.id) }))} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></article>)}</div>}
      </div>}

      {section === 'needs' && <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{tr(profile, 'BESOINS DU MOIS', 'احتياجات الشهر', 'MONTHLY NEEDS')}</span><h3>{tr(profile, 'Vêtements, nettoyage & autres', 'الملابس والتنظيف واحتياجات أخرى', 'Clothing, cleaning & more')}</h3></div></div>
        <div className="kenz-family-summary-grid">
          <article><span>{tr(profile, 'Prévu', 'المخطط', 'Planned')}</span><strong>{formatMoney(plan.needs.reduce((sum, item) => sum + item.plannedMinor, 0), profile.preferredCurrency, profile.locale)}</strong></article>
          <article><span>{tr(profile, 'Réel', 'الفعلي', 'Actual')}</span><strong>{formatMoney(plan.needs.reduce((sum, item) => sum + item.actualMinor, 0), profile.preferredCurrency, profile.locale)}</strong></article>
          <article><span>{tr(profile, 'Articles', 'العناصر', 'Items')}</span><strong>{plan.needs.length}</strong></article>
        </div>
        <p className="text-xs text-slate-500">{tr(profile, 'Ajoutez les achats prévus : vêtements par membre, chaussures, lessive, savon, fournitures scolaires, transport, entretien et tout besoin personnalisé.', 'أضف المشتريات المخططة: ملابس لكل فرد، أحذية، مسحوق الغسيل، الصابون، اللوازم المدرسية، النقل والصيانة وكل احتياج خاص.', 'Track planned purchases: clothing per family member, shoes, laundry detergent, soap, school supplies, transport, maintenance and any custom need.')}</p>
        <div className="grid grid-cols-2 gap-2">
          <label>{tr(profile, 'Catégorie', 'الفئة', 'Category')}<select value={needCategory} onChange={(e) => setNeedCategory(e.target.value as HouseholdNeedCategory)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm">
            <option value="clothing">{tr(profile, 'Vêtements & chaussures', 'ملابس وأحذية', 'Clothing & footwear')}</option>
            <option value="cleaning">{tr(profile, 'Nettoyage', 'التنظيف', 'Cleaning')}</option>
            <option value="hygiene">{tr(profile, 'Hygiène', 'النظافة الشخصية', 'Personal hygiene')}</option>
            <option value="school">{tr(profile, 'École', 'المدرسة', 'School')}</option>
            <option value="transport">{tr(profile, 'Transport', 'النقل', 'Transport')}</option>
            <option value="health">{tr(profile, 'Santé', 'الصحة', 'Health')}</option>
            <option value="home">{tr(profile, 'Maison', 'المنزل', 'Home')}</option>
            <option value="other">{tr(profile, 'Autre', 'أخرى', 'Other')}</option>
          </select></label>
          <label>{tr(profile, 'Montant prévu (DA)', 'المبلغ المخطط (دج)', 'Planned amount (DA)')}<input inputMode="decimal" value={needPlanned} onChange={(e) => setNeedPlanned(e.target.value)} placeholder="0.00" className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label className="col-span-2">{tr(profile, 'Article / besoin', 'المنتج / الاحتياج', 'Item / need')}<input value={needName} onChange={(e) => setNeedName(e.target.value)} placeholder={tr(profile, 'Ex. veste hiver, lessive, cahiers…', 'مثلاً معطف شتوي، مسحوق غسيل، كراريس…', 'e.g. winter jacket, detergent, notebooks…')} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label>{tr(profile, 'Pour qui ? (facultatif)', 'لمن؟ (اختياري)', 'For whom? (optional)')}<input value={needMember} onChange={(e) => setNeedMember(e.target.value)} placeholder={tr(profile, 'Nom / membre', 'اسم الفرد', 'Name / member')} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          {needCategory === 'clothing' && <><label>{tr(profile, 'Saison', 'الموسم', 'Season')}<select value={needSeason} onChange={(e) => setNeedSeason(e.target.value as ClothingSeason)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"><option value="all">{tr(profile, 'Toute saison', 'كل المواسم', 'All seasons')}</option><option value="spring">{tr(profile, 'Printemps', 'الربيع', 'Spring')}</option><option value="summer">{tr(profile, 'Été', 'الصيف', 'Summer')}</option><option value="autumn">{tr(profile, 'Automne', 'الخريف', 'Autumn')}</option><option value="winter">{tr(profile, 'Hiver', 'الشتاء', 'Winter')}</option></select></label><label>{tr(profile, 'Taille (facultatif)', 'المقاس (اختياري)', 'Size (optional)')}<input value={needSize} onChange={(e) => setNeedSize(e.target.value)} placeholder={tr(profile, 'Taille', 'المقاس', 'Size')} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label></>}
          <label>{tr(profile, 'Date prévue (facultatif)', 'التاريخ المتوقع (اختياري)', 'Due date (optional)')}<input type="date" min={monthFirstDay(month)} max={monthLastDay(month)} value={needDate} onChange={(e) => setNeedDate(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
        </div>
        <button onClick={addNeed} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white"><Plus className="inline mr-2 h-4 w-4" />{tr(profile, 'Ajouter le besoin', 'إضافة الاحتياج', 'Add need')}</button>
        {plan.needs.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">{tr(profile, 'Aucun besoin détaillé pour ce mois.', 'لا توجد احتياجات مفصلة لهذا الشهر.', 'No detailed needs for this month yet.')}</p> : <div className="space-y-2">{plan.needs.map((item) => <article key={item.id} className="rounded-xl border border-violet-100 p-3">
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><strong className="block text-xs">{item.name}</strong><span className="text-[10px] text-slate-500">{tr(profile, item.category === 'clothing' ? 'Vêtements' : item.category === 'cleaning' ? 'Nettoyage' : item.category === 'hygiene' ? 'Hygiène' : item.category === 'school' ? 'École' : item.category === 'transport' ? 'Transport' : item.category === 'health' ? 'Santé' : item.category === 'home' ? 'Maison' : 'Autre', item.category === 'clothing' ? 'ملابس' : item.category === 'cleaning' ? 'تنظيف' : item.category === 'hygiene' ? 'نظافة' : item.category === 'school' ? 'مدرسة' : item.category === 'transport' ? 'نقل' : item.category === 'health' ? 'صحة' : item.category === 'home' ? 'منزل' : 'أخرى', item.category)}{item.member ? ' · ' + item.member : ''}{item.season ? ' · ' + tr(profile, item.season === 'spring' ? 'Printemps' : item.season === 'summer' ? 'Été' : item.season === 'autumn' ? 'Automne' : item.season === 'winter' ? 'Hiver' : 'Toute saison', item.season === 'spring' ? 'الربيع' : item.season === 'summer' ? 'الصيف' : item.season === 'autumn' ? 'الخريف' : item.season === 'winter' ? 'الشتاء' : 'كل المواسم', item.season) : ''}{item.size ? ' · ' + item.size : ''}{item.dueDate ? ' · ' + item.dueDate : ''}</span><span className="mt-1 block text-[10px] text-slate-500">{tr(profile, 'Prévu', 'مخطط', 'Planned')}: {formatMoney(item.plannedMinor, profile.preferredCurrency, profile.locale)}</span></div><button aria-label={tr(profile, 'Supprimer', 'حذف', 'Delete')} onClick={() => updatePlan((current) => ({ ...current, needs: current.needs.filter((need) => need.id !== item.id) }))} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
          <label className="mt-2">{tr(profile, 'Montant réellement dépensé', 'المبلغ المصروف فعلياً', 'Actual amount spent')}<input key={item.id + '-actual'} inputMode="decimal" defaultValue={moneyField(item.actualMinor)} onBlur={(e) => { const next = updateNeedActual(item.id, e.currentTarget.value, item.actualMinor); e.currentTarget.value = moneyField(next); }} className="mt-1 w-full h-10 rounded-lg border px-3 text-sm font-mono-numbers" /></label>
        </article>)}</div>}
        <p className="text-[10px] text-slate-500">{tr(profile, 'Ces lignes détaillent les achats. Elles ne modifient pas automatiquement les enveloppes du budget principal afin d’éviter les doubles comptages.', 'هذه البنود تفصل المشتريات ولا تعدّل تلقائياً مخصصات الميزانية الرئيسية لتجنب احتساب المصروف مرتين.', 'These line items detail purchases and do not automatically change the main budget envelopes, to avoid double counting.')}</p>
      </div>}
      {section === 'recipes' && <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{tr(profile, 'COLLECTION', 'مجموعة الوصفات', 'COLLECTION')}</span><h3>{tr(profile, 'Recettes familiales', 'وصفات عائلية', 'Family recipes')}</h3></div><span className="text-xs text-slate-500">{recipes.length}</span></div>
        <div className="space-y-2">{recipes.map((recipe) => <article key={recipe.id} className="rounded-xl border border-violet-100 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><strong className="block text-xs">{recipeTitle(recipe)}</strong><p className="mt-1 text-[10px] text-slate-500">{recipeDescription(recipe)}</p><span className="mt-1 inline-block text-[10px] text-violet-700">{recipe.origin === 'community' ? tr(profile, 'Partagée par la communauté', 'مشاركة من المجتمع', 'Community shared') : tr(profile, 'Recette Kenz', 'وصفة كينز', 'Kenz recipe')}{recipe.author ? ' · ' + recipe.author : ''} · {recipe.prepMinutes} min</span></div><button onClick={() => setShareText(exportCommunityRecipe(recipe))} aria-label={tr(profile, 'Exporter la recette', 'تصدير الوصفة', 'Export recipe')} className="rounded-lg p-2 text-violet-700"><Download className="h-4 w-4" /></button></div></article>)}</div>
        {shareText && <div className="space-y-2"><label>{tr(profile, 'Code de partage (JSON)', 'رمز المشاركة (JSON)', 'Share code (JSON)')}<textarea readOnly value={shareText} rows={7} className="mt-1 w-full rounded-xl border p-3 text-xs" /></label><button onClick={() => copyText(shareText)} className="min-h-10 rounded-xl border border-violet-200 px-3 text-xs font-bold text-violet-700">{tr(profile, 'Copier le code', 'نسخ الرمز', 'Copy code')}</button></div>}
        <div className="border-t border-violet-100 pt-3 space-y-2"><h4 className="text-xs font-bold">{tr(profile, 'Importer une recette partagée', 'استيراد وصفة مشتركة', 'Import a shared recipe')}</h4><p className="text-[10px] text-slate-500">{tr(profile, 'Collez le JSON reçu. La recette sera enregistrée localement dans votre collection.', 'ألصق JSON الذي تلقيته. سيتم حفظ الوصفة محلياً في مجموعتك.', 'Paste the JSON you received. The recipe is saved locally in your collection.')}</p><textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} placeholder='{"title":"...","ingredients":[],"steps":[]}' className="w-full rounded-xl border p-3 text-xs" /><button onClick={importRecipe} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white"><Upload className="inline mr-2 h-4 w-4" />{tr(profile, 'Importer la recette', 'استيراد الوصفة', 'Import recipe')}</button></div>
      </div>}

      <p className="text-[10px] text-slate-500">{tr(profile, 'Planning et inventaire privés, enregistrés sur cet appareil. Les recettes importées restent privées tant que vous ne les partagez pas.', 'التخطيط والمخزون خاصان ومحفوظان على هذا الجهاز. تبقى الوصفات المستوردة خاصة ما لم تقم بمشاركتها.', 'Plans and pantry are private and stored on this device. Imported recipes remain private unless you explicitly share them.')}</p>
    </section>
  );
};
