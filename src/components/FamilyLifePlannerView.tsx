import React, { useEffect, useMemo, useState } from 'react';
import { Home, Utensils, Sparkles, Shirt, Car, GraduationCap, HeartPulse, Wifi, Wrench, CreditCard, PiggyBank, Package, Users, AlertTriangle, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import { FamilyLivingPlannerView } from './FamilyLivingPlannerView';
import type { Category, RecurringItem, Transaction, UserProfile } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import {
  applyFamilyBudgetSources, createFamilyBudgetPlan, familyBudgetStorageKey, summarizeFamilyBudget,
  updateFamilyCategory, validateFamilyBudgetPlan, suggestFamilyBudgetAllocations, type FamilyBudgetCategoryId, type FamilyBudgetPlan,
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
  const [plannedInputs, setPlannedInputs] = useState<Record<string, string>>({});
  const [incomeInput, setIncomeInput] = useState(() => moneyInput(readPlan(profile.id, currentMonth()).monthlyIncomeMinor));
  const [adultsInput, setAdultsInput] = useState(String(readPlan(profile.id, currentMonth()).adults));
  const [childrenInput, setChildrenInput] = useState(String(readPlan(profile.id, currentMonth()).children));
  const [saveState, setSaveState] = useState<'saved' | 'error'>('saved');
  const [activeSection, setActiveSection] = useState<'budget' | 'living'>('budget');
  const [budgetMessage, setBudgetMessage] = useState('');
  const [suggestedPlan, setSuggestedPlan] = useState<FamilyBudgetPlan | null>(null);

  useEffect(() => {
    const next = readPlan(profile.id, selectedMonth);
    setPlan(next);
    setSuggestedPlan(null);
    setIncomeInput(moneyInput(next.monthlyIncomeMinor));
    setAdultsInput(String(next.adults));
    setChildrenInput(String(next.children));
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
    const recurringIncome = recurringItems.filter((item) => {
      if (item.userId !== profile.id || !item.isActive || item.type !== 'income' || item.currency !== profile.preferredCurrency) return false;
      if (item.nextDueDate.slice(0, 7) !== selectedMonth) return false;
      const alreadyRecorded = incomeTransactions.some((tx) =>
        tx.recurringItemId === item.id ||
        (!tx.recurringItemId && tx.amountMinor === item.amountMinor && (tx.description || '').trim().toLowerCase() === item.name.trim().toLowerCase())
      );
      return !alreadyRecorded;
    }).reduce((sum, item) => sum + item.amountMinor, 0);
    return transactionTotal + recurringIncome;
  }, [monthTransactions, recurringItems, profile.id, profile.preferredCurrency, selectedMonth]);

  const hasIncomeSource = monthTransactions.some((tx) => tx.type === 'income') ||
    recurringItems.some((item) => item.userId === profile.id && item.isActive && item.type === 'income' &&
      item.currency === profile.preferredCurrency && item.nextDueDate.slice(0, 7) === selectedMonth);
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
          item.currency !== profile.preferredCurrency || item.nextDueDate.slice(0, 7) !== selectedMonth) continue;
      const sourceCategory = categories.find((category) => category.id === item.categoryId);
      const familyId = familyCategoryFor(sourceCategory?.name || item.name);
      const monthlyAmount = item.frequency === 'weekly' ? item.amountMinor * 4 :
        item.frequency === 'biweekly' ? item.amountMinor * 2 : item.amountMinor;
      totals.set(familyId, (totals.get(familyId) || 0) + monthlyAmount);
    }
    return totals;
  }, [recurringItems, categories, profile.id, profile.preferredCurrency, selectedMonth]);

  const effectivePlan = useMemo(() => applyFamilyBudgetSources(
    { ...plan, monthlyIncomeMinor },
    recurringPlannedByCategory,
    actualByCategory,
  ), [plan, monthlyIncomeMinor, actualByCategory, recurringPlannedByCategory]);

  useEffect(() => {
    setPlannedInputs(Object.fromEntries(effectivePlan.categories.map((row) => [row.id, moneyInput(row.plannedMinor)])));
  }, [selectedMonth, effectivePlan.categories]);

  const summary = useMemo(() => summarizeFamilyBudget(effectivePlan), [effectivePlan]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const dailyExpenses = useMemo(() => monthTransactions
    .filter((tx) => tx.type === 'expense')
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt)), [monthTransactions]);

  const updatePlan = (field: 'plannedMinor' | 'priority', id: FamilyBudgetCategoryId, value: number) => {
    if (field === 'plannedMinor') {
      const otherTotal = effectivePlan.categories.filter((row) => row.id !== id).reduce((sum, row) => sum + row.plannedMinor, 0);
      if (!Number.isSafeInteger(otherTotal + value)) {
        setBudgetMessage(t(profile, 'Le total dépasse la limite numérique autorisée.', 'المجموع يتجاوز الحد الرقمي المسموح.', 'The total exceeds the supported amount.'));
        return false;
      }
    }
    try {
      const next = updateFamilyCategory(plan, id, field, value);
      setBudgetMessage(''); setSuggestedPlan(null); setPlan(next);
      return true;
    } catch {
      setBudgetMessage(t(profile, 'Montant ou priorité invalide.', 'المبلغ أو الأولوية غير صالحين.', 'Amount or priority is invalid.'));
      return false;
    }
  };

  const createBudgetDraft = () => {
    const next = suggestFamilyBudgetAllocations(effectivePlan);
    const changed = next.categories.some((row, index) => row.plannedMinor !== effectivePlan.categories[index].plannedMinor);
    if (!changed) {
      setSuggestedPlan(null);
      setBudgetMessage(t(profile, 'Aucun solde à répartir. Vérifiez le revenu et les enveloppes déjà saisies.', 'لا يوجد رصيد لتوزيعه. تحقق من الدخل والمخصصات المدخلة.', 'Nothing is available to allocate. Check income and existing envelopes.'));
      return;
    }
    setBudgetMessage(''); setSuggestedPlan(next);
  };

  const setIncome = () => {
    const amount = parseBudgetInput(incomeInput);
    if (amount === null) { setIncomeInput(moneyInput(monthlyIncomeMinor)); return; }
    setSuggestedPlan(null);
    setPlan((current) => ({
      ...current,
      ...(hasIncomeSource ? { monthlyIncomeOverrideMinor: amount } : { monthlyIncomeMinor: amount, monthlyIncomeOverrideMinor: null }),
      updatedAt: new Date().toISOString(),
    }));
    setBudgetMessage(t(profile,
      'Revenu utilisé mis à jour pour ce mois. Vos opérations Kenz restent inchangées.',
      'تم تحديث الدخل المستخدم لهذا الشهر. لم تتغير عمليات كنز الأصلية.',
      'Income used for this month updated. Your original Kenz transactions are unchanged.'));
  };

  const resetIncomeToKenz = () => {
    setPlan((current) => ({ ...current, monthlyIncomeOverrideMinor: null, updatedAt: new Date().toISOString() }));
    setIncomeInput(moneyInput(incomeSourceMinor));
    setSuggestedPlan(null);
    setBudgetMessage(t(profile, 'Revenu Kenz automatique rétabli.', 'تمت استعادة دخل كنز التلقائي.', 'Automatic Kenz income restored.'));
  };

  const setHousehold = () => {
    const adults = Number(adultsInput); const children = Number(childrenInput);
    if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0 || adults + children < 1 || adults > 30 || children > 30) { setAdultsInput(String(plan.adults)); setChildrenInput(String(plan.children)); return; }
    setPlan((current) => ({ ...current, adults, children, updatedAt: new Date().toISOString() }));
  };

  return (
    <section className="kenz-family-planner space-y-4" dir={profile.locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="kenz-family-hero">
        <div className="kenz-family-hero-icon"><Users /></div>
        <div className="min-w-0 flex-1">
          <span className="kenz-eyebrow">KENZ · FAMILY FINANCE</span>
          <h2>{t(profile, 'Budget familial automatique', 'ميزانية الأسرة التلقائية', 'Automatic family budget')}</h2>
          <p>{t(profile, 'Un seul budget connecté à vos opérations et revenus Kenz.', 'ميزانية واحدة مرتبطة بمداخيلك وعملياتك في كنز.', 'One budget connected to your Kenz income and transactions.')}</p>
        </div>
      </header>

      <div className="kenz-family-subtabs kenz-family-main-tabs">
        <button onClick={() => setActiveSection('budget')} className={activeSection === 'budget' ? 'active' : ''}>{t(profile, 'Budget du mois', 'ميزانية الشهر', 'Monthly budget')}</button>
        <button onClick={() => setActiveSection('living')} className={activeSection === 'living' ? 'active' : ''}>{t(profile, 'Repas & maison', 'الوجبات والمنزل', 'Meals & home')}</button>
      </div>

      {activeSection === 'living' ? (
        <FamilyLivingPlannerView profile={profile} month={selectedMonth} householdSize={Math.max(1, plan.adults + plan.children)} />
      ) : <>
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

        <div className="kenz-family-panel space-y-3">
          <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'FOYER', 'الأسرة', 'HOUSEHOLD')}</span><h3>{t(profile, 'Composition & revenu', 'تركيبة الأسرة والدخل', 'Household & income')}</h3></div></div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">{t(profile, 'Adultes', 'البالغون', 'Adults')}<input type="number" min="0" max="30" value={adultsInput} onChange={(e) => setAdultsInput(e.target.value)} onBlur={setHousehold} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
            <label className="text-xs text-slate-500">{t(profile, 'Enfants', 'الأطفال', 'Children')}<input type="number" min="0" max="30" value={childrenInput} onChange={(e) => setChildrenInput(e.target.value)} onBlur={setHousehold} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
            <label className="text-xs text-slate-500">{t(profile, 'Revenu utilisé (DA)', 'الدخل المعتمد (دج)', 'Income used (DA)')}<input inputMode="decimal" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} onBlur={setIncome} onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm font-mono-numbers focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />{hasIncomeSource && <button type="button" onClick={resetIncomeToKenz} className="mt-1 text-[10px] font-semibold text-violet-700 underline">{t(profile, 'Rétablir le revenu Kenz', 'استعادة دخل كنز', 'Reset to Kenz income')}</button>}</label>
          </div>
        </div>

        <div className={summary.deficitMinor > 0 ? 'kenz-family-status warning' : 'kenz-family-status'}>
          {summary.deficitMinor > 0 ? <AlertTriangle /> : <CheckCircle2 />}
          <div><strong>{summary.deficitMinor > 0 ? t(profile, 'Budget supérieur au revenu', 'الميزانية تتجاوز الدخل', 'Plan exceeds income') : t(profile, 'Solde non affecté', 'الرصيد غير المخصص', 'Unallocated balance')}</strong><span>{summary.deficitMinor > 0 ? t(profile, 'Réduisez ou réorganisez les montants selon vos priorités.', 'خفّض أو أعد توزيع المبالغ حسب أولوياتك.', 'Adjust amounts according to your priorities.') : t(profile, 'Montant restant après les enveloppes planifiées.', 'المبلغ المتبقي بعد المخصصات المخططة.', 'Amount left after planned envelopes.')}</span><b>{formatMoney(Math.abs(summary.unallocatedMinor), profile.preferredCurrency, profile.locale)}</b></div>
        </div>

        <div className="kenz-family-panel space-y-3">
          <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'PLANIFICATION', 'التخطيط', 'PLANNING')}</span><h3>{t(profile, 'Répartition automatique', 'التوزيع التلقائي', 'Automatic allocation')}</h3></div></div>
          {budgetMessage && <p role="status" className="kenz-family-inline-status">{budgetMessage}</p>}
          <p className="text-xs text-slate-500">{t(profile, 'Kenz suit les dépenses depuis vos opérations. Ajustez les montants prévus et les priorités ; les dépenses réelles ne sont plus saisies deux fois.', 'يتابع كنز المصاريف من عملياتك. عدّل المبالغ المخططة والأولويات؛ لن تحتاج لإدخال المصاريف الفعلية مرتين.', 'Kenz tracks spending from your transactions. Adjust planned amounts and priorities; actual expenses are no longer entered twice.')}</p>
          <button onClick={createBudgetDraft} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white">{t(profile, 'Générer ma répartition', 'أنشئ توزيع ميزانيتي', 'Generate my allocation')}</button>
          {suggestedPlan && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
            <strong className="text-xs text-violet-950">{t(profile, 'Brouillon de répartition', 'مسودة توزيع الميزانية', 'Suggested budget draft')}</strong>
            <p className="text-[10px] text-violet-800">{t(profile, 'Les montants proposés sont calculés à partir du revenu disponible et de vos priorités. Rien ne change avant validation.', 'المبالغ المقترحة محسوبة من الدخل المتاح وأولوياتك. لن يتغير شيء قبل التأكيد.', 'Suggested amounts use available income and your priorities. Nothing changes until you apply them.')}</p>
            <div className="space-y-1">{suggestedPlan.categories.filter((row, index) => row.plannedMinor !== effectivePlan.categories[index].plannedMinor).map((row) => <div key={row.id} className="flex justify-between gap-2 text-xs"><span>{labels[row.id][profile.locale]}</span><strong>{formatMoney(row.plannedMinor, profile.preferredCurrency, profile.locale)}</strong></div>)}</div>
            <div className="flex gap-2"><button onClick={() => { setPlan({ ...suggestedPlan, monthlyIncomeMinor: hasIncomeSource ? plan.monthlyIncomeMinor : suggestedPlan.monthlyIncomeMinor }); setSuggestedPlan(null); setBudgetMessage(t(profile, 'Répartition appliquée. Vous pouvez modifier chaque montant.', 'تم تطبيق التوزيع. يمكنك تعديل كل مبلغ.', 'Draft applied. You can still edit every amount.')); }} className="flex-1 min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white">{t(profile, 'Appliquer', 'تطبيق', 'Apply')}</button><button onClick={() => setSuggestedPlan(null)} className="min-h-10 rounded-lg border border-violet-200 px-3 text-xs font-bold text-violet-700">{t(profile, 'Ignorer', 'تجاهل', 'Discard')}</button></div>
          </div>}
          <div className="space-y-2">
            {effectivePlan.categories.map((row) => {
              const item = labels[row.id]; const Icon = item.icon;
              const remaining = row.plannedMinor - row.actualMinor;
              return <article className="kenz-family-category" key={profile.id + '-' + row.id}>
                <div className="kenz-family-category-title"><span><Icon /></span><strong>{item[profile.locale]}</strong><small>{formatMoney(remaining, profile.preferredCurrency, profile.locale)} {t(profile, 'restant', 'متبقٍ', 'left')}</small><label className="kenz-family-priority">{t(profile, 'Priorité', 'الأولوية', 'Priority')}<select value={row.priority} onChange={(e) => updatePlan('priority', row.id, Number(e.target.value))} className="mt-1 rounded-lg border px-2 py-1 text-[10px]"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></select></label></div>
                <div className="grid grid-cols-2 gap-2">
                  <label>{t(profile, 'Prévu', 'مخطط', 'Planned')}<input key={selectedMonth + '-' + row.id + '-planned'} inputMode="decimal" value={plannedInputs[row.id] ?? moneyInput(row.plannedMinor)} onChange={(e) => setPlannedInputs((current) => ({ ...current, [row.id]: e.target.value }))} onBlur={(e) => { const amount = parseBudgetInput(e.currentTarget.value); if (amount === null) { setPlannedInputs((current) => ({ ...current, [row.id]: moneyInput(row.plannedMinor) })); return; } if (updatePlan('plannedMinor', row.id, amount)) setPlannedInputs((current) => ({ ...current, [row.id]: moneyInput(amount) })); else setPlannedInputs((current) => ({ ...current, [row.id]: moneyInput(row.plannedMinor) })); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full h-10 px-3 mt-1 rounded-lg border text-sm font-mono-numbers" /></label>
                  <div className="text-xs"><span className="block">{t(profile, 'Réel · opérations Kenz', 'الفعلي · عمليات كنز', 'Actual · Kenz transactions')}</span><strong className="block mt-2 text-sm font-mono-numbers">{formatMoney(row.actualMinor, profile.preferredCurrency, profile.locale)}</strong></div>
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
