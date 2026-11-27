import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Home, Utensils, Sparkles, Shirt, Car, GraduationCap, HeartPulse, Wifi, Wrench, CreditCard, PiggyBank, Package, Users, AlertTriangle, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import { FamilyLivingPlannerView } from './FamilyLivingPlannerView';
import type { Category, RecurringItem, Transaction, UserProfile } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import { PRODUCT_CATALOG, productName } from '../domain/productCatalog';
import { isVerifiedMarketPrice, simulateMonthlyBudget, type SimulatorPrice } from '../domain/simulator';
import { STARTER_BASKET, toMilliUnits } from '../domain/starterBasket';
import { loadMarketPrices } from '../services/priceStore';
import {
  applyFamilyBudgetSources, countRecurringOccurrencesInMonth, createFamilyBudgetPlan, familyBudgetStorageKey, summarizeFamilyBudget,
  validateFamilyBudgetPlan, suggestFamilyBudgetAllocations, normalizeLegacyAutoAllocation, type FamilyBudgetCategoryId, type FamilyBudgetPlan,
} from '../domain/familyBudget';

interface Props {
  profile: UserProfile;
  categories: Category[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
}

const labels: Record<FamilyBudgetCategoryId, { fr: string; ar: string; en: string; icon: React.ElementType }> = {
  housing: { fr: 'Logement & factures', ar: 'السكن والفواتير', en: 'Housing & bills', icon: Home },
  food: { fr: 'Alimentation & courses', ar: 'الغذاء والمشتريات', en: 'Food & groceries', icon: Utensils },
  cleaning: { fr: 'Nettoyage & entretien', ar: 'التنظيف والمنظفات', en: 'Cleaning supplies', icon: Sparkles },
  hygiene: { fr: 'Hygiène personnelle', ar: 'النظافة الشخصية', en: 'Personal hygiene', icon: HeartPulse },
  clothing: { fr: 'Vêtements & chaussures', ar: 'الملابس والأحذية', en: 'Clothing & footwear', icon: Shirt },
  transport: { fr: 'Transport', ar: 'النقل', en: 'Transport', icon: Car },
  education: { fr: 'Éducation & école', ar: 'التعليم والمدرسة', en: 'Education & school', icon: GraduationCap },
  health: { fr: 'Santé & pharmacie', ar: 'الصحة والصيدلية', en: 'Health & pharmacy', icon: HeartPulse },
  communications: { fr: 'Internet & téléphone', ar: 'الإنترنت والهاتف', en: 'Internet & phone', icon: Wifi },
  maintenance: { fr: 'Entretien du logement', ar: 'صيانة المنزل', en: 'Home maintenance', icon: Wrench },
  debt: { fr: 'Remboursements', ar: 'تسديد الديون', en: 'Debt payments', icon: CreditCard },
  savings: { fr: 'Épargne & urgence', ar: 'الادخار والطوارئ', en: 'Savings & emergency', icon: PiggyBank },
  other: { fr: 'Autres besoins', ar: 'احتياجات أخرى', en: 'Other needs', icon: Package },
};

const t = (profile: UserProfile, fr: string, ar: string, en: string) =>
  profile.locale === 'ar' ? ar : profile.locale === 'en' ? en : fr;

const readPlan = (userId: string, month: string): FamilyBudgetPlan => {
  const fallback = createFamilyBudgetPlan(userId, month);
  try {
    const raw = localStorage.getItem(familyBudgetStorageKey(userId, month));
    if (!raw) return fallback;
    const stored = validateFamilyBudgetPlan(JSON.parse(raw), userId);
    return stored?.month === month ? stored : fallback;
  } catch { return fallback; }
};

const moneyInput = (minor: number) => (minor / 100).toFixed(2);
const parseBudgetInput = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };
const familyCategoryFor = (name?: string): FamilyBudgetCategoryId => {
  const value = (name || '').toLocaleLowerCase();
  if (/logement|loyer|maison|housing|rent|electric|électric|gaz|water|eau|فاتور|سكن/.test(value)) return 'housing';
  if (/aliment|course|food|grocery|restaurant|repas|غذاء|مشتريات|مطعم/.test(value)) return 'food';
  if (/nettoy|clean|detergent|منظف/.test(value)) return 'cleaning';
  if (/hygi|soin|personal care|hygiene|نظافة/.test(value)) return 'hygiene';
  if (/vêtement|chauss|clothing|shoes|ملابس/.test(value)) return 'clothing';
  if (/transport|carburant|fuel|taxi|نقل/.test(value)) return 'transport';
  if (/éduc|ecole|école|school|education|مدرس|تعليم/.test(value)) return 'education';
  if (/santé|sante|pharm|health|medical|طب|صحة/.test(value)) return 'health';
  if (/internet|téléphone|telephone|mobile|communication|هاتف|انترنت/.test(value)) return 'communications';
  if (/maintenance|répar|repar|entretien|صيانة/.test(value)) return 'maintenance';
  if (/dette|debt|rembours|قرض|دين/.test(value)) return 'debt';
  if (/épargne|epargne|saving|savings|ادخار/.test(value)) return 'savings';
  return 'other';
};

export const FamilyLifePlannerView: React.FC<Props> = ({ profile, categories, transactions, recurringItems }) => {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [plan, setPlan] = useState<FamilyBudgetPlan>(() => readPlan(profile.id, currentMonth()));
  const [incomeInput, setIncomeInput] = useState(() => moneyInput(readPlan(profile.id, currentMonth()).monthlyIncomeMinor));
  const [saveState, setSaveState] = useState<'saved' | 'error'>('saved');
  const [activeSection, setActiveSection] = useState<'budget' | 'living'>('budget');
  const [mealPlanCostMinor, setMealPlanCostMinor] = useState(0);
  const [mealPlanCostComplete, setMealPlanCostComplete] = useState(true);
  const [marketPrices, setMarketPrices] = useState<Record<string, SimulatorPrice>>({});
  const [priceLoadStatus, setPriceLoadStatus] = useState<'loading' | 'live' | 'cache' | 'unavailable'>('loading');
  const handleFoodPlanCostChange = useCallback((amountMinor: number, complete: boolean) => {
    setMealPlanCostMinor(Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? amountMinor : 0);
    setMealPlanCostComplete(complete);
  }, []);

  useEffect(() => {
    const next = readPlan(profile.id, selectedMonth);
    setMealPlanCostMinor(0);
    setMealPlanCostComplete(true);
    setPlan(next);
    setIncomeInput(moneyInput(next.monthlyIncomeMinor));
  }, [profile.id, selectedMonth]);

  useEffect(() => {
    if (plan.userId !== profile.id || plan.month !== selectedMonth) return;
    try {
      localStorage.setItem(familyBudgetStorageKey(profile.id, plan.month), JSON.stringify(plan));
      setSaveState('saved');
    } catch { setSaveState('error'); }
  }, [plan, profile.id, selectedMonth]);

  const monthTransactions = useMemo(() => transactions.filter((tx) =>
    tx.userId === profile.id && tx.currency === profile.preferredCurrency && tx.transactionDate.slice(0, 7) === selectedMonth
  ), [transactions, profile.id, profile.preferredCurrency, selectedMonth]);

  const incomeSourceMinor = useMemo(() => {
    const incomeTransactions = monthTransactions.filter((tx) => tx.type === 'income');
    const transactionTotal = incomeTransactions.reduce((sum, tx) => sum + tx.amountMinor, 0);
    const recurringIncome = recurringItems.reduce((sum, item) => {
      if (item.userId !== profile.id || !item.isActive || item.type !== 'income' || item.currency !== profile.preferredCurrency) return sum;
      const dueCount = countRecurringOccurrencesInMonth(item.frequency, item.nextDueDate, selectedMonth, item.billingDayOfMonth);
      if (dueCount === 0) return sum;
      const recordedCount = incomeTransactions.filter((tx) =>
        tx.recurringItemId === item.id ||
        (!tx.recurringItemId && tx.amountMinor === item.amountMinor && (tx.description || '').trim().toLowerCase() === item.name.trim().toLowerCase())
      ).length;
      return sum + item.amountMinor * Math.max(0, dueCount - recordedCount);
    }, 0);
    return transactionTotal + recurringIncome;
  }, [monthTransactions, recurringItems, profile.id, profile.preferredCurrency, selectedMonth]);

  const hasIncomeSource = monthTransactions.some((tx) => tx.type === 'income') ||
    recurringItems.some((item) => item.userId === profile.id && item.isActive && item.type === 'income' &&
      item.currency === profile.preferredCurrency &&
      countRecurringOccurrencesInMonth(item.frequency, item.nextDueDate, selectedMonth, item.billingDayOfMonth) > 0);
  const monthlyIncomeMinor = plan.monthlyIncomeOverrideMinor != null
    ? plan.monthlyIncomeOverrideMinor
    : hasIncomeSource ? incomeSourceMinor : plan.monthlyIncomeMinor;

  useEffect(() => {
    setIncomeInput(moneyInput(monthlyIncomeMinor));
  }, [selectedMonth, monthlyIncomeMinor]);

  const actualByCategory = useMemo(() => {
    const totals = new Map<FamilyBudgetCategoryId, number>();
    for (const row of plan.categories) totals.set(row.id, 0);
    for (const tx of monthTransactions) {
      if (tx.type !== 'expense') continue;
      const sourceCategory = categories.find((category) => category.id === tx.categoryId);
      const familyId = familyCategoryFor(sourceCategory?.name || tx.description);
      totals.set(familyId, (totals.get(familyId) || 0) + tx.amountMinor);
    }
    return totals;
  }, [monthTransactions, categories, plan.categories]);

  const recurringPlannedByCategory = useMemo(() => {
    const totals = new Map<FamilyBudgetCategoryId, number>();
    for (const item of recurringItems) {
      if (item.userId !== profile.id || !item.isActive || item.type !== 'expense' ||
          item.currency !== profile.preferredCurrency) continue;
      const dueCount = countRecurringOccurrencesInMonth(item.frequency, item.nextDueDate, selectedMonth, item.billingDayOfMonth);
      if (dueCount === 0) continue;
      const sourceCategory = categories.find((category) => category.id === item.categoryId);
      const familyId = familyCategoryFor(sourceCategory?.name || item.name);
      const monthlyAmount = item.amountMinor * dueCount;
      totals.set(familyId, (totals.get(familyId) || 0) + monthlyAmount);
    }
    return totals;
  }, [recurringItems, categories, profile.id, profile.preferredCurrency, selectedMonth]);

  const effectivePlan = useMemo(() => applyFamilyBudgetSources(
    { ...plan, monthlyIncomeMinor },
    recurringPlannedByCategory,
    actualByCategory,
  ), [plan, monthlyIncomeMinor, actualByCategory, recurringPlannedByCategory]);

  // Load published market prices once; household and income changes only rerun the local calculation.
  useEffect(() => {
    let active = true;
    if (profile.preferredCurrency !== 'DZD') {
      setMarketPrices({});
      setPriceLoadStatus('unavailable');
      return () => { active = false; };
    }
    setPriceLoadStatus('loading');
    const slugs = STARTER_BASKET.map((row) => row.slug);
    loadMarketPrices(slugs).then((loaded) => {
      if (!active) return;
      setMarketPrices(loaded.pricesBySlug);
      setPriceLoadStatus(loaded.source === 'live' ? 'live' : loaded.source === 'cache' ? 'cache' : 'unavailable');
    }).catch(() => {
      if (!active) return;
      setMarketPrices({});
      setPriceLoadStatus('unavailable');
    });
    return () => { active = false; };
  }, [profile.preferredCurrency]);

  const foodSimulation = useMemo(() => {
    if (profile.preferredCurrency !== 'DZD' || priceLoadStatus === 'loading') return null;
    const items = STARTER_BASKET.flatMap((row) => {
      const product = PRODUCT_CATALOG.find((candidate) => candidate.slug === row.slug);
      if (!product) return [];
      const price = marketPrices[row.slug];
      return [{
        productId: product.slug,
        name: productName(product, profile.locale),
        category: product.category,
        baseUnit: product.baseUnit,
        ...(product.substituteGroup ? { substituteGroup: product.substituteGroup } : {}),
        quantityPerPersonPerDayMilliUnits: toMilliUnits(product.baseUnit, row.perDay),
        ...(isVerifiedMarketPrice(price) ? { price } : {}),
      }];
    });
    const result = simulateMonthlyBudget({
      month: selectedMonth,
      household: { adults: Math.max(1, plan.adults), children: plan.children },
      availableBudgetMinor: monthlyIncomeMinor,
      items,
    });
    return {
      amountMinor: result.pricedSubtotal.expectedMinor,
      complete: result.complete,
      pricedProducts: result.dataQuality.pricedProducts,
      totalProducts: items.length,
    };
  }, [selectedMonth, plan.adults, plan.children, monthlyIncomeMinor, profile.preferredCurrency, profile.locale, marketPrices, priceLoadStatus]);

  // Verified market prices always contribute to the food envelope. Partial baskets are
  // shown as a lower bound in the UI, never presented as a complete total.
  const automaticAllocationPlan = useMemo(() => {
    if (plan.allocationMode !== 'automatic') return effectivePlan;
    const recurringFood = recurringPlannedByCategory.get('food') || 0;
    const simulatedFood = foodSimulation?.amountMinor || 0;
    // Even with missing ingredient prices, the verified subtotal is a real lower bound.
    // Keep it in the food envelope instead of silently treating planned meals as zero.
    const plannedMeals = mealPlanCostMinor;
    const foodEnvelope = Math.max(recurringFood, simulatedFood, plannedMeals);
    return {
      ...effectivePlan,
      categories: effectivePlan.categories.map((row) => row.id === 'food'
        ? { ...row, plannedMinor: foodEnvelope, plannedOverride: true }
        : row),
    };
  }, [plan.allocationMode, effectivePlan, recurringPlannedByCategory, foodSimulation, mealPlanCostComplete, mealPlanCostMinor]);

  useEffect(() => {
    if (plan.userId !== profile.id || plan.month !== selectedMonth) return;
    if (plan.allocationMode === undefined) {
      const migrated = normalizeLegacyAutoAllocation(plan, monthlyIncomeMinor);
      if (migrated.allocationMode !== undefined) setPlan(migrated);
      return;
    }
    if (plan.allocationMode !== 'automatic') return;
    const next = suggestFamilyBudgetAllocations(automaticAllocationPlan);
    const changed = next.categories.some((row, index) =>
      row.plannedMinor !== plan.categories[index]?.plannedMinor
    );
    if (!changed) return;
    setPlan((current) => {
      if (current.allocationMode !== 'automatic' || current.month !== selectedMonth || current.userId !== profile.id) return current;
      return {
        ...current,
        categories: current.categories.map((row) => {
          const recalculated = next.categories.find((item) => item.id === row.id);
          return recalculated ? { ...row, plannedMinor: recalculated.plannedMinor, plannedOverride: false } : row;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, [plan.userId, plan.month, plan.allocationMode, plan.adults, plan.children, plan.categories, profile.id, selectedMonth, monthlyIncomeMinor, automaticAllocationPlan]);
  const summary = useMemo(() => summarizeFamilyBudget(effectivePlan), [effectivePlan]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const dailyExpenses = useMemo(() => monthTransactions
    .filter((tx) => tx.type === 'expense')
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt)), [monthTransactions]);

  const updateHouseholdCount = (field: 'adults' | 'children', rawValue: string) => {
    if (rawValue.trim() === '') return;
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < (field === 'adults' ? 1 : 0) || value > 30) return;
    setPlan((current) => {
      const adults = field === 'adults' ? value : current.adults;
      const children = field === 'children' ? value : current.children;
      if (adults + children > 40) return current;
      return {
        ...current, adults, children, allocationMode: 'automatic',
        categories: current.categories.map((row) => ({ ...row, plannedOverride: false })),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const setIncome = () => {
    const amount = parseBudgetInput(incomeInput);
    if (amount === null || amount <= 0) { setIncomeInput(moneyInput(monthlyIncomeMinor)); return; }
    // One income entry resets legacy manual envelopes and runs the existing allocator automatically.
    setPlan((current) => ({
      ...current,
      monthlyIncomeMinor: amount,
      monthlyIncomeOverrideMinor: hasIncomeSource ? amount : null,
      allocationMode: 'automatic',
      categories: current.categories.map((row) => ({ ...row, plannedOverride: false })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateAllocationAmount = (categoryId: FamilyBudgetCategoryId, raw: string) => {
    const amount = parseBudgetInput(raw);
    if (amount === null) return;
    setPlan((current) => ({
      ...current,
      allocationMode: 'custom',
      categories: current.categories.map((row) => row.id === categoryId
        ? { ...row, plannedMinor: amount, plannedOverride: true }
        : row),
      updatedAt: new Date().toISOString(),
    }));
  };

  const resetAllocationsToAutomatic = () => {
    setPlan((current) => ({
      ...current,
      allocationMode: 'automatic',
      categories: current.categories.map((row) => ({ ...row, plannedOverride: false })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const resetIncomeToKenz = () => {
    setPlan((current) => ({
      ...current,
      monthlyIncomeOverrideMinor: null,
      allocationMode: 'automatic',
      categories: current.categories.map((row) => ({ ...row, plannedOverride: false })),
      updatedAt: new Date().toISOString(),
    }));
    setIncomeInput(moneyInput(incomeSourceMinor));
  };

  return (
    <section className="kenz-family-planner space-y-4" data-kenz-no-auto-translate dir={profile.locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="kenz-family-hero">
        <div className="kenz-family-hero-icon"><Users /></div>
        <div className="min-w-0 flex-1">
          <span className="kenz-eyebrow">KENZ · FAMILY FINANCE</span>
          <h2>{t(profile, 'Budget familial automatique', 'ميزانية الأسرة التلقائية', 'Automatic family budget')}</h2>
          <p>{t(profile, 'Un seul budget connecté à vos opérations et revenus Kenz.', 'ميزانية واحدة مرتبطة بمداخيلك وعملياتك في كنز.', 'One budget connected to your Kenz income and transactions.')}</p>
        </div>
      </header>

      <div className="kenz-family-tabs kenz-family-main-tabs">
        <button type="button" onClick={() => setActiveSection('budget')} aria-current={activeSection === 'budget' ? 'page' : undefined} className={activeSection === 'budget' ? 'kenz-family-main-tab active' : 'kenz-family-main-tab'}><span className="kenz-family-main-tab-icon"><Wallet aria-hidden="true" /></span><span><strong>{t(profile, 'Budget du mois', 'ميزانية الشهر', 'Monthly budget')}</strong><small>{t(profile, 'Revenus, enveloppes et suivi', 'الدخل والمخصصات والمتابعة', 'Income, allocations & tracking')}</small></span></button>
        <button type="button" onClick={() => setActiveSection('living')} aria-current={activeSection === 'living' ? 'page' : undefined} className={activeSection === 'living' ? 'kenz-family-main-tab active' : 'kenz-family-main-tab'}><span className="kenz-family-main-tab-icon"><Utensils aria-hidden="true" /></span><span><strong>{t(profile, 'Repas & maison', 'الوجبات والمنزل', 'Meals & home')}</strong><small>{t(profile, 'Repas, courses et réserves', 'الوجبات والمشتريات والمخزون', 'Meals, groceries & pantry')}</small></span></button>
      </div>

      <div className={activeSection === 'living' ? '' : 'hidden'}>
        <FamilyLivingPlannerView profile={profile} month={selectedMonth} householdSize={Math.max(1, plan.adults + plan.children)} onFoodPlanCostChange={handleFoodPlanCostChange} />
      </div>
      {activeSection === 'budget' && <>
        <div className="kenz-family-panel space-y-3">
          <div className="kenz-section-heading">
            <div><span className="kenz-card-kicker">{t(profile, 'PÉRIODE', 'الفترة', 'PERIOD')}</span><h3>{t(profile, 'Vue financière du foyer', 'الوضع المالي للأسرة', 'Household finances')}</h3></div>
            <span className="text-xs text-slate-500">{saveState === 'saved' ? t(profile, 'Plan enregistré', 'تم حفظ الخطة', 'Plan saved') : t(profile, 'Erreur de sauvegarde', 'خطأ في الحفظ', 'Save error')}</span>
          </div>
          <label className="block text-xs text-slate-500">{t(profile, 'Mois', 'الشهر', 'Month')}<input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <article className="rounded-xl border p-3"><span className="block text-[11px] text-slate-500">{t(profile, 'Revenus', 'المداخيل', 'Income')}</span><strong className="text-base text-emerald-600">{formatMoney(summary.incomeMinor, profile.preferredCurrency, profile.locale)}</strong></article>
            <article className="rounded-xl border p-3"><span className="block text-[11px] text-slate-500">{t(profile, 'Prévu', 'المخطط', 'Planned')}</span><strong className="text-base">{formatMoney(summary.plannedMinor, profile.preferredCurrency, profile.locale)}</strong></article>
            <article className="rounded-xl border p-3"><span className="block text-[11px] text-slate-500">{t(profile, 'Dépensé', 'المصروف', 'Spent')}</span><strong className="text-base text-rose-600">{formatMoney(summary.actualMinor, profile.preferredCurrency, profile.locale)}</strong></article>
            <article className="rounded-xl border p-3"><span className="block text-[11px] text-slate-500">{t(profile, 'Disponible', 'المتبقي', 'Available')}</span><strong className={summary.incomeMinor - summary.actualMinor < 0 ? 'text-base text-rose-600' : 'text-base text-emerald-600'}>{formatMoney(summary.incomeMinor - summary.actualMinor, profile.preferredCurrency, profile.locale)}</strong></article>
          </div>
          <p className="text-[11px] text-slate-500">{plan.monthlyIncomeOverrideMinor != null
            ? t(profile, 'Vous utilisez un montant personnalisé pour ce budget. Les opérations Kenz ne sont pas modifiées.', 'تستخدم مبلغاً مخصصاً لهذه الميزانية. لم يتم تعديل عمليات كنز.', 'A custom amount is being used for this budget. Kenz transactions are unchanged.')
            : hasIncomeSource
              ? t(profile, 'Revenu détecté automatiquement depuis Kenz. Vous pouvez le modifier ici sans changer vos opérations.', 'تم اكتشاف الدخل تلقائياً من كنز. يمكنك تعديله هنا دون تغيير عملياتك.', 'Income detected automatically from Kenz. You can edit it here without changing your transactions.')
              : t(profile, 'Aucun revenu Kenz enregistré pour ce mois : saisissez votre estimation.', 'لا يوجد دخل مسجل في كنز لهذا الشهر: أدخل تقديرك.', 'No Kenz income is recorded for this month; enter your estimate.')}</p>
        </div>

        <div className="kenz-family-panel space-y-3" data-kenz-no-auto-translate dir={profile.locale === 'ar' ? 'rtl' : 'ltr'}>
          <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'VOTRE REVENU', 'دخلك الشهري', 'YOUR INCOME')}</span><h3>{t(profile, 'Un montant pour tout Kenz', 'مبلغ واحد لكل كنز', 'One amount for all of Kenz')}</h3></div></div>
          <label className="block text-xs text-slate-600">{t(profile, 'Revenu mensuel total (DA)', 'الدخل الشهري الإجمالي (دج)', 'Total monthly income (DA)')}
            <input inputMode="decimal" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setIncome(); }} className="mt-1 w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold font-mono-numbers shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" />
          </label>
          <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-slate-800">{t(profile, 'Composition de la famille', 'تركيبة الأسرة', 'Family members')}</strong>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-700">{Math.max(1, plan.adults) + plan.children} {t(profile, 'personnes', 'أفراد', 'members')}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-600">{t(profile, 'Adultes', 'البالغون', 'Adults')}
                <input type="number" min="1" max="30" step="1" value={Math.max(1, plan.adults)} onChange={(e) => updateHouseholdCount('adults', e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold" />
              </label>
              <label className="block text-xs text-slate-600">{t(profile, 'Enfants', 'الأطفال', 'Children')}
                <input type="number" min="0" max="30" step="1" value={plan.children} onChange={(e) => updateHouseholdCount('children', e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold" />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">{t(profile, 'Les enfants sont comptés selon leur consommation estimée. Maximum 40 membres.', 'يُحسب استهلاك الأطفال وفق معامل الاستهلاك المعتمد. الحد الأقصى 40 فرداً.', 'Children are weighted using the simulator’s child-consumption factor. Maximum 40 members.')}</p>
          </div>
          <button type="button" onClick={setIncome} className="w-full min-h-12 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white">{t(profile, 'Calculer mon budget automatiquement', 'احسب ميزانيتي تلقائياً', 'Calculate my budget automatically')}</button>
          <p className="text-[11px] text-slate-500">{plan.monthlyIncomeOverrideMinor != null
            ? t(profile, 'يستخدم كنز المبلغ الذي أدخلته، ويعيد تشغيل محركات الميزانية تلقائياً.', 'Kenz utilise votre montant et relance automatiquement les moteurs du budget.', 'Kenz uses your amount and automatically reruns the budget engines.')
            : hasIncomeSource
              ? t(profile, 'تم اكتشاف الدخل من عمليات كنز. يمكنك إدخال مبلغ آخر ثم تشغيل الحساب.', 'Revenu détecté depuis les opérations Kenz. Vous pouvez saisir un autre montant puis lancer le calcul.', 'Income detected from Kenz transactions. You can enter another amount and run the calculation.')
              : t(profile, 'أدخل دخلك الشهري مرة واحدة. سيتولى كنز توزيع المبلغ تلقائياً.', 'Saisissez votre revenu une seule fois. Kenz répartira automatiquement le montant.', 'Enter your monthly income once. Kenz will allocate it automatically.')}</p>
          {hasIncomeSource && <button type="button" onClick={resetIncomeToKenz} className="text-[10px] font-semibold text-teal-700 underline">{t(profile, 'Restaurer le revenu automatique de Kenz', 'استعادة دخل كنز التلقائي', 'Restore Kenz automatic income')}</button>}
        </div>

        <div className="kenz-family-panel space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><span className="kenz-card-kicker">{t(profile, 'PRIX DU MARCHÉ', 'أسعار السوق', 'MARKET PRICES')}</span><h3 className="text-sm font-semibold text-slate-900">{t(profile, 'Coût alimentaire estimé', 'التكلفة الغذائية المقدّرة', 'Estimated monthly food cost')}</h3></div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">{priceLoadStatus === 'live' ? t(profile, 'Prix publiés · direct', 'أسعار منشورة · مباشر', 'Live published prices') : priceLoadStatus === 'cache' ? t(profile, 'Prix en cache', 'أسعار محفوظة', 'Cached prices') : priceLoadStatus === 'loading' ? t(profile, 'Chargement…', 'جارٍ التحميل…', 'Loading…') : t(profile, 'Prix indisponibles', 'الأسعار غير متاحة', 'Prices unavailable')}</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <strong className="text-2xl font-bold tracking-tight text-slate-900">{foodSimulation && foodSimulation.pricedProducts > 0 ? formatMoney(foodSimulation.amountMinor, profile.preferredCurrency, profile.locale) : '—'}</strong>
            <span className="text-xs text-slate-500">{foodSimulation ? `${foodSimulation.pricedProducts}/${foodSimulation.totalProducts} ${t(profile, 'produits avec prix vérifiés', 'منتجات بأسعار موثقة', 'products with verified prices')}` : t(profile, 'En attente des prix', 'بانتظار الأسعار', 'Waiting for prices')}</span>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">{foodSimulation?.complete
            ? t(profile, 'Estimation mensuelle calculée avec les prix publiés et la composition actuelle du foyer.', 'تقدير شهري محسوب بالأسعار المنشورة وتركيبة الأسرة الحالية.', 'Monthly estimate calculated from published prices and the current family size.')
            : foodSimulation && foodSimulation.pricedProducts > 0
              ? t(profile, 'Ce montant additionne uniquement les produits avec un prix vérifié : c’est un minimum, pas le coût alimentaire complet. Le budget sera actualisé lorsque les autres prix seront disponibles.', 'هذا مجموع المنتجات التي تتوفر لها أسعار موثقة فقط؛ هو حد أدنى وليس تكلفة غذائية كاملة. ستُحدّث الميزانية تلقائياً عند توفر أسعار بقية المنتجات.', 'This is only the subtotal of products with verified prices; it is a lower bound, not a complete food budget. Kenz will update it when more product prices become available.')
              : t(profile, 'Aucun prix de marché publié n’est actuellement disponible pour ce panier. Kenz n’inventera pas de prix.', 'لا توجد حالياً أسعار سوق منشورة لهذه السلة. لن يخترع كنز أسعاراً تقديرية.', 'No published market prices are currently available for this basket. Kenz will not invent prices.')}</p>
          <p className="text-[10px] leading-4 text-slate-500">{t(profile, 'Source : panier de base Kenz, avec des quantités mensuelles adaptées à la taille du foyer. Le montant additionne uniquement les produits dont le prix du marché est vérifié.', 'المصدر: سلة كنز الأساسية، بكميات شهرية تتناسب مع عدد أفراد الأسرة. المبلغ يجمع المنتجات التي لها سعر سوق موثّق فقط.', 'Source: Kenz’s standard starter basket, with monthly quantities scaled to household size. The amount sums only products with verified market prices.')}</p>
          {foodSimulation && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.min(100, foodSimulation.totalProducts ? foodSimulation.pricedProducts / foodSimulation.totalProducts * 100 : 0)}%` }} /></div>}
        </div>

        <div className={summary.deficitMinor > 0 ? 'kenz-family-status warning' : 'kenz-family-status'}>
          {summary.deficitMinor > 0 ? <AlertTriangle /> : <CheckCircle2 />}
          <div><strong>{summary.deficitMinor > 0 ? t(profile, 'Budget supérieur au revenu', 'الميزانية تتجاوز الدخل', 'Plan exceeds income') : t(profile, 'Solde non affecté', 'الرصيد غير المخصص', 'Unallocated balance')}</strong><span>{summary.deficitMinor > 0 ? t(profile, 'Réduisez ou réorganisez les montants selon vos priorités.', 'خفّض أو أعد توزيع المبالغ حسب أولوياتك.', 'Adjust amounts according to your priorities.') : t(profile, 'Montant restant après les enveloppes planifiées.', 'المبلغ المتبقي بعد المخصصات المخططة.', 'Amount left after planned envelopes.')}</span><b>{formatMoney(Math.abs(summary.unallocatedMinor), profile.preferredCurrency, profile.locale)}</b></div>
        </div>

        <div className="kenz-family-panel space-y-3">
          <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'PLANIFICATION', 'التخطيط', 'PLANNING')}</span><h3>{t(profile, 'Répartition automatique', 'التوزيع التلقائي', 'Automatic allocation')}</h3></div></div>
          <p className="text-xs text-slate-500">{t(profile, 'Les enveloppes sont calculées automatiquement à partir du revenu, des engagements, des prix du marché et des repas planifiés. Les dépenses réelles viennent des opérations Kenz.', 'تُحسب المخصصات تلقائياً من دخلك والتزاماتك وأسعار السوق والوجبات المخططة. المصروفات الفعلية تأتي من سجل عمليات كنز.', 'Allocations are calculated automatically from income, commitments, market prices and planned meals. Actual expenses come from Kenz transactions.')}</p>

          <div className="kenz-allocation-mode-row"><span>{plan.allocationMode === 'automatic' ? t(profile, 'Mode automatique', 'الوضع التلقائي', 'Automatic mode') : t(profile, 'Montants personnalisés', 'مبالغ مخصصة', 'Custom amounts')}</span>{plan.allocationMode !== 'automatic' && <button type="button" onClick={resetAllocationsToAutomatic}>{t(profile, 'Recalculer automatiquement', 'إعادة الحساب تلقائياً', 'Recalculate automatically')}</button>}</div>          <p className="text-[10px] leading-4 text-slate-500">{t(profile, 'Calcul de l’enveloppe alimentaire : en mode automatique, Kenz compare les engagements récurrents, l’estimation du panier de marché et le coût des repas programmés, puis retient le montant le plus élevé. Il s’agit d’un montant prévu, pas d’une dépense réelle.', 'طريقة حساب مخصص الغذاء: في الوضع التلقائي، يقارن كنز الالتزامات الدورية وتقدير سلة السوق وتكلفة الوجبات المخططة، ثم يعتمد المبلغ الأعلى. هذا مبلغ مخطط وليس إنفاقاً فعلياً.', 'Food allocation: in automatic mode, Kenz compares recurring commitments, the market-basket estimate and planned-meal cost, then uses the highest amount. This is a planned amount, not actual spending.')}</p>

          <div className="space-y-2">
            {effectivePlan.categories.map((row) => {
              const item = labels[row.id]; const Icon = item.icon;
              const categoryMealCost = row.id === 'food' ? mealPlanCostMinor : 0;
              const remaining = row.plannedMinor - row.actualMinor - categoryMealCost;
              return <article className="kenz-family-category kenz-allocation-card" key={profile.id + '-' + row.id}>
                <div className="kenz-allocation-heading">
                  <div className="kenz-allocation-identity">
                    <span className="kenz-allocation-icon"><Icon aria-hidden="true" /></span>
                    <div className="kenz-allocation-name">
                      <strong>{item[profile.locale]}</strong>
                      <span className="kenz-allocation-remaining">{formatMoney(remaining, profile.preferredCurrency, profile.locale)} {t(profile, 'restant', 'متبقٍ', 'remaining')}</span>
                    </div>
                  </div>
                  {row.id === 'food' && <button type="button" className="kenz-allocation-link" onClick={() => setActiveSection('living')}>{t(profile, 'Voir les repas', 'عرض الوجبات', 'View meals')} <span aria-hidden="true">↗</span></button>}
                </div>
                {row.id === 'food' && <div className="kenz-allocation-meals">
                  <span>{t(profile, 'Repas planifiés', 'الوجبات المخططة', 'Planned meals')}</span>
                  <strong>{formatMoney(mealPlanCostMinor, profile.preferredCurrency, profile.locale)}</strong>
                  <p>{t(profile, 'Source : somme des coûts des ingrédients des recettes programmées dans le calendrier du mois, selon les quantités, les portions et les prix vérifiés disponibles. Le total est partiel si certains prix manquent.', 'المصدر: مجموع تكلفة مكونات الوصفات المبرمجة في تقويم الشهر، حسب الكميات والحصص وأسعار السوق الموثقة المتاحة. يكون المجموع جزئياً عند غياب أسعار بعض المكونات.', 'Source: total ingredient cost for recipes scheduled this month, based on quantities, servings and available verified prices. The total is partial when some prices are missing.')}</p>
                </div>}
                <div className="kenz-allocation-metrics">
                  <div className="kenz-allocation-metric planned">
                    <span>{t(profile, 'Enveloppe automatique', 'المخصص التلقائي', 'Automatic allocation')}</span>
                    <label className="kenz-allocation-edit"><input aria-label={t(profile, 'Montant planifié', 'المبلغ المخطط', 'Planned amount')} inputMode="decimal" value={moneyInput(row.plannedMinor)} onChange={(e) => updateAllocationAmount(row.id, e.target.value)} /><span>{t(profile, 'DA', 'دج', 'DA')}</span></label>
                  </div>
                  <div className="kenz-allocation-metric actual">
                    <span>{t(profile, 'Réel · opérations Kenz', 'الفعلي · عمليات كنز', 'Actual · Kenz transactions')}</span>
                    <strong>{formatMoney(row.actualMinor, profile.preferredCurrency, profile.locale)}</strong>
                  </div>
                </div>
              </article>;
            })}
          </div>
        </div>

        <div className="kenz-family-panel space-y-3">
          <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'JOURNAL', 'السجل اليومي', 'JOURNAL')}</span><h3>{t(profile, 'Dépenses quotidiennes', 'المصاريف اليومية', 'Daily expenses')}</h3></div><span className="text-xs text-slate-500">{dailyExpenses.length}</span></div>
          {dailyExpenses.length === 0 ? <p className="text-xs text-slate-500">{t(profile, 'Aucune dépense enregistrée pour ce mois. Les opérations et reçus apparaîtront ici automatiquement.', 'لا توجد مصاريف مسجلة لهذا الشهر. ستظهر العمليات والإيصالات هنا تلقائياً.', 'No expenses recorded this month. Transactions and scanned receipts will appear here automatically.')}</p> :
            <div className="divide-y divide-slate-200">
              {dailyExpenses.map((tx) => {
                const categoryName = tx.categoryId ? categoryNameById.get(tx.categoryId) : undefined;
                return <div key={tx.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><ReceiptText className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{tx.description || categoryName || t(profile, 'Dépense', 'مصروف', 'Expense')}</strong><span className="text-[10px] text-slate-500">{tx.transactionDate} · {categoryName || t(profile, 'Non classé', 'غير مصنف', 'Uncategorized')}</span></div>
                  <strong className="shrink-0 text-xs font-mono-numbers text-rose-600">-{formatMoney(tx.amountMinor, tx.currency, profile.locale)}</strong>
                </div>;
              })}
            </div>}
        </div>

        <div className="text-[11px] text-slate-500 flex items-center gap-2"><Wallet className="h-4 w-4" />{t(profile, 'Les montants réels proviennent du registre Kenz ; aucun doublon de saisie.', 'المبالغ الفعلية مصدرها سجل كنز دون إدخال مكرر.', 'Actual amounts come from Kenz records, with no duplicate entry.')}</div>
      </>}
    </section>
  );
};
