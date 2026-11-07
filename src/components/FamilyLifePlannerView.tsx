import React, { useEffect, useMemo, useState } from 'react';
import { FamilyLivingPlannerView } from './FamilyLivingPlannerView';
import { Home, Utensils, Sparkles, Shirt, Car, GraduationCap, HeartPulse, Wifi, Wrench, CreditCard, PiggyBank, Package, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { UserProfile } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import {
  createFamilyBudgetPlan, familyBudgetStorageKey, summarizeFamilyBudget,
  updateFamilyCategory, validateFamilyBudgetPlan, suggestFamilyBudgetAllocations, type FamilyBudgetCategoryId, type FamilyBudgetPlan,
} from '../domain/familyBudget';

interface Props { profile: UserProfile; }

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

export const FamilyLifePlannerView: React.FC<Props> = ({ profile }) => {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [plan, setPlan] = useState<FamilyBudgetPlan>(() => readPlan(profile.id, currentMonth()));
  const [incomeInput, setIncomeInput] = useState(() => moneyInput(readPlan(profile.id, currentMonth()).monthlyIncomeMinor));
  const [adultsInput, setAdultsInput] = useState(String(readPlan(profile.id, new Date().toISOString().slice(0, 7)).adults));
  const [childrenInput, setChildrenInput] = useState(String(readPlan(profile.id, new Date().toISOString().slice(0, 7)).children));
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

  const summary = useMemo(() => summarizeFamilyBudget(plan), [plan]);
  const updatePlan = (field: 'plannedMinor' | 'actualMinor' | 'priority', id: FamilyBudgetCategoryId, value: number) => {
    if (field !== 'priority') {
      const otherTotal = plan.categories.filter((row) => row.id !== id).reduce((sum, row) => sum + row[field], 0);
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
    const next = suggestFamilyBudgetAllocations(plan);
    const changed = next.categories.some((row, index) => row.plannedMinor !== plan.categories[index].plannedMinor);
    if (!changed) {
      setSuggestedPlan(null);
      setBudgetMessage(t(profile, 'Aucun solde à répartir. Vérifiez le revenu et les enveloppes déjà saisies.', 'لا يوجد رصيد لتوزيعه. تحقق من الدخل والمخصصات المدخلة.', 'Nothing is available to allocate. Check income and existing envelopes.'));
      return;
    }
    setBudgetMessage(''); setSuggestedPlan(next);
  };
  const setIncome = () => {
    const amount = parseBudgetInput(incomeInput);
    if (amount === null) { setIncomeInput(moneyInput(plan.monthlyIncomeMinor)); return; }
    setSuggestedPlan(null);
    setPlan((current) => ({ ...current, monthlyIncomeMinor: amount, updatedAt: new Date().toISOString() }));
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
          <span className="kenz-eyebrow">KENZ · FAMILY PLANNER</span>
          <h2>{t(profile, 'Budget de toute la famille', 'ميزانية الأسرة كاملة', 'Whole-family budget')}</h2>
          <p>{t(profile, 'Organisez les dépenses du mois, sans pourcentage imposé.', 'نظّم مصاريف الشهر دون نسب مفروضة.', 'Plan the month without forced spending percentages.')}</p>
        </div>
      </header>

      <div className="kenz-family-subtabs kenz-family-main-tabs">
        <button onClick={() => setActiveSection('budget')} className={activeSection === 'budget' ? 'active' : ''}>{t(profile, 'Budget complet', 'الميزانية الكاملة', 'Full budget')}</button>
        <button onClick={() => setActiveSection('living')} className={activeSection === 'living' ? 'active' : ''}>{t(profile, 'Repas & maison', 'الوجبات والمنزل', 'Meals & home')}</button>
      </div>
      {activeSection === 'living' ? (
        <FamilyLivingPlannerView profile={profile} month={selectedMonth} householdSize={Math.max(1, plan.adults + plan.children)} />
      ) : <>
      <div className="kenz-family-summary-grid">
        <article><span>{t(profile, 'Revenu mensuel', 'الدخل الشهري', 'Monthly income')}</span><strong>{formatMoney(summary.incomeMinor, profile.preferredCurrency, profile.locale)}</strong></article>
        <article><span>{t(profile, 'Budget planifié', 'الميزانية المخططة', 'Planned budget')}</span><strong>{formatMoney(summary.plannedMinor, profile.preferredCurrency, profile.locale)}</strong></article>
        <article><span>{t(profile, 'Dépenses réelles', 'المصروف الفعلي', 'Actual spending')}</span><strong>{formatMoney(summary.actualMinor, profile.preferredCurrency, profile.locale)}</strong></article>
      </div>

      <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'CONFIGURATION', 'الإعدادات', 'SETUP')}</span><h3>{t(profile, 'Votre foyer', 'أسرتك', 'Your household')}</h3></div><span className="text-xs text-slate-500">{saveState === 'saved' ? t(profile, 'Enregistré sur cet appareil', 'محفوظ على هذا الجهاز', 'Saved on this device') : t(profile, 'Stockage indisponible', 'التخزين غير متاح', 'Storage unavailable')}</span></div>
        <label className="block text-xs text-slate-500">{t(profile, 'Mois à planifier', 'الشهر المراد تخطيطه', 'Planning month')}<input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-500">{t(profile, 'Adultes', 'البالغون', 'Adults')}<input type="number" min="0" max="30" value={adultsInput} onChange={(e) => setAdultsInput(e.target.value)} onBlur={setHousehold} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label className="text-xs text-slate-500">{t(profile, 'Enfants', 'الأطفال', 'Children')}<input type="number" min="0" max="30" value={childrenInput} onChange={(e) => setChildrenInput(e.target.value)} onBlur={setHousehold} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" /></label>
          <label className="text-xs text-slate-500">{t(profile, 'Revenu (DA)', 'الدخل (دج)', 'Income (DA)')}<input inputMode="decimal" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} onBlur={setIncome} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm font-mono-numbers" /></label>
        </div>
      </div>

      <div className={summary.deficitMinor > 0 ? 'kenz-family-status warning' : 'kenz-family-status'}>
        {summary.deficitMinor > 0 ? <AlertTriangle /> : <CheckCircle2 />}
        <div><strong>{summary.deficitMinor > 0 ? t(profile, 'Budget supérieur au revenu', 'الميزانية تتجاوز الدخل', 'Plan exceeds income') : t(profile, 'Solde non affecté', 'الرصيد غير المخصص', 'Unallocated balance')}</strong><span>{summary.deficitMinor > 0 ? t(profile, 'Réduisez ou réorganisez les montants selon vos priorités.', 'خفّض أو أعد توزيع المبالغ حسب أولوياتك.', 'Adjust amounts according to your priorities.') : t(profile, 'Vous pouvez encore affecter ce montant à vos besoins ou à votre épargne.', 'يمكنك تخصيص هذا المبلغ لاحتياجاتك أو لمدخراتك.', 'You can still assign this amount to needs or savings.')}</span><b>{formatMoney(Math.abs(summary.unallocatedMinor), profile.preferredCurrency, profile.locale)}</b></div>
      </div>

      <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'PLANIFICATION', 'التخطيط', 'PLANNING')}</span><h3>{t(profile, 'Tous les besoins du foyer', 'كل احتياجات الأسرة', 'Everyday family needs')}</h3></div></div>
        {budgetMessage && <p role="status" className="kenz-family-inline-status">{budgetMessage}</p>}
        <p className="text-xs text-slate-500">{t(profile, 'Saisissez un montant prévu et mettez à jour le réel au fil du mois. Toutes les valeurs restent modifiables.', 'أدخل المبلغ المخطط وحدّث المصروف الفعلي خلال الشهر. كل القيم قابلة للتعديل.', 'Enter a planned amount and update actual spending during the month. Every amount is editable.')}</p>
        <p className="text-[10px] text-slate-500">{t(profile, 'Priorité 1 = faible, 5 = élevée. Ajustez les priorités avant de générer votre brouillon.', 'الأولوية 1 = منخفضة و5 = مرتفعة. عدّل الأولويات قبل إنشاء المسودة.', 'Priority 1 = lower, 5 = higher. Adjust priorities before generating your draft.')}</p>
        <button onClick={createBudgetDraft} className="w-full min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white">{t(profile, 'Proposer une répartition du revenu', 'اقترح توزيع الدخل', 'Suggest a budget allocation')}</button>
        {suggestedPlan && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
          <strong className="text-xs text-violet-950">{t(profile, 'Brouillon de répartition', 'مسودة توزيع الميزانية', 'Suggested budget draft')}</strong>
          <p className="text-[10px] text-violet-800">{t(profile, 'Les enveloppes déjà renseignées sont conservées. Le solde est réparti selon vos priorités 1 à 5. Rien ne change avant validation.', 'تم الاحتفاظ بالمخصصات المدخلة. يوزع الرصيد حسب أولوياتك من 1 إلى 5. لن يتغير شيء قبل التأكيد.', 'Existing allocations are preserved. The remaining income is distributed using your 1–5 priorities. Nothing changes until you apply it.')}</p>
          <div className="space-y-1">{suggestedPlan.categories.filter((row, index) => row.plannedMinor !== plan.categories[index].plannedMinor).map((row) => <div key={row.id} className="flex justify-between gap-2 text-xs"><span>{labels[row.id][profile.locale]}</span><strong>{formatMoney(row.plannedMinor, profile.preferredCurrency, profile.locale)}</strong></div>)}</div>
          <div className="flex gap-2"><button onClick={() => { setPlan(suggestedPlan); setSuggestedPlan(null); setBudgetMessage(t(profile, 'Répartition appliquée. Vous pouvez encore modifier chaque montant.', 'تم تطبيق التوزيع. يمكنك تعديل كل مبلغ.', 'Draft applied. You can still edit every amount.')); }} className="flex-1 min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white">{t(profile, 'Appliquer', 'تطبيق', 'Apply')}</button><button onClick={() => setSuggestedPlan(null)} className="min-h-10 rounded-lg border border-violet-200 px-3 text-xs font-bold text-violet-700">{t(profile, 'Ignorer', 'تجاهل', 'Discard')}</button></div>
        </div>}
        <div className="space-y-2">
          {plan.categories.map((row) => {
            const item = labels[row.id]; const Icon = item.icon;
            const remaining = row.plannedMinor - row.actualMinor;
            return <article className="kenz-family-category" key={profile.id + '-' + row.id}>
              <div className="kenz-family-category-title"><span><Icon /></span><strong>{item[profile.locale]}</strong><small>{formatMoney(remaining, profile.preferredCurrency, profile.locale)} {t(profile, 'restant', 'متبقٍ', 'left')}</small><label className="kenz-family-priority">{t(profile, 'Priorité', 'الأولوية', 'Priority')}<select value={row.priority} onChange={(e) => updatePlan('priority', row.id, Number(e.target.value))} className="mt-1 rounded-lg border px-2 py-1 text-[10px]"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></select></label></div>
              <div className="grid grid-cols-2 gap-2">
                <label>{t(profile, 'Prévu', 'مخطط', 'Planned')}<input key={selectedMonth + '-' + row.id + '-planned'} inputMode="decimal" defaultValue={moneyInput(row.plannedMinor)} onBlur={(e) => { const amount = parseBudgetInput(e.target.value); if (amount === null) e.currentTarget.value = moneyInput(row.plannedMinor); else if (!updatePlan('plannedMinor', row.id, amount)) e.currentTarget.value = moneyInput(row.plannedMinor); }} className="w-full h-10 px-3 mt-1 rounded-lg border text-sm font-mono-numbers" /></label>
                <label>{t(profile, 'Réel', 'فعلي', 'Actual')}<input key={selectedMonth + '-' + row.id + '-actual'} inputMode="decimal" defaultValue={moneyInput(row.actualMinor)} onBlur={(e) => { const amount = parseBudgetInput(e.target.value); if (amount === null) e.currentTarget.value = moneyInput(row.actualMinor); else if (!updatePlan('actualMinor', row.id, amount)) e.currentTarget.value = moneyInput(row.actualMinor); }} className="w-full h-10 px-3 mt-1 rounded-lg border text-sm font-mono-numbers" /></label>
              </div>
            </article>;
          })}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{t(profile, 'Les données familiales sont privées et restent locales sur cet appareil dans cette première étape. La synchronisation multi-appareils sera ajoutée après validation du modèle.', 'بيانات الأسرة خاصة ومحفوظة محلياً على هذا الجهاز في هذه المرحلة. ستضاف المزامنة بين الأجهزة بعد اعتماد النموذج.', 'Family data is private and stays on this device in this first stage. Multi-device sync will follow after the model is validated.')}</p>
      </>}
    </section>
  );
};
