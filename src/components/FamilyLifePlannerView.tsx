import React, { useEffect, useMemo, useState } from 'react';
import { Home, Utensils, Sparkles, Shirt, Car, GraduationCap, HeartPulse, Wifi, Wrench, CreditCard, PiggyBank, Package, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { UserProfile } from '../domain/types';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';
import {
  createFamilyBudgetPlan, familyBudgetStorageKey, summarizeFamilyBudget,
  updateFamilyCategory, validateFamilyBudgetPlan, type FamilyBudgetCategoryId, type FamilyBudgetPlan,
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

const readPlan = (userId: string): FamilyBudgetPlan => {
  const fallback = createFamilyBudgetPlan(userId);
  try {
    const raw = localStorage.getItem(familyBudgetStorageKey(userId));
    if (!raw) return fallback;
    return validateFamilyBudgetPlan(JSON.parse(raw), userId) || fallback;
  } catch { return fallback; }
};

const moneyInput = (minor: number) => (minor / 100).toFixed(2);

export const FamilyLifePlannerView: React.FC<Props> = ({ profile }) => {
  const [plan, setPlan] = useState<FamilyBudgetPlan>(() => readPlan(profile.id));
  const [incomeInput, setIncomeInput] = useState(() => moneyInput(readPlan(profile.id).monthlyIncomeMinor));
  const [adultsInput, setAdultsInput] = useState(String(readPlan(profile.id).adults));
  const [childrenInput, setChildrenInput] = useState(String(readPlan(profile.id).children));
  const [saveState, setSaveState] = useState<'saved' | 'error'>('saved');

  useEffect(() => {
    const next = readPlan(profile.id);
    setPlan(next);
    setIncomeInput(moneyInput(next.monthlyIncomeMinor));
    setAdultsInput(String(next.adults));
    setChildrenInput(String(next.children));
  }, [profile.id]);

  useEffect(() => {
    try {
      localStorage.setItem(familyBudgetStorageKey(profile.id), JSON.stringify(plan));
      setSaveState('saved');
    } catch { setSaveState('error'); }
  }, [plan, profile.id]);

  const summary = useMemo(() => summarizeFamilyBudget(plan), [plan]);
  const updatePlan = (field: 'plannedMinor' | 'actualMinor', id: FamilyBudgetCategoryId, value: number) => {
    try { setPlan((current) => updateFamilyCategory(current, id, field, value)); }
    catch { setSaveState('error'); }
  };
  const setIncome = () => {
    const amount = parseToMinorUnits(incomeInput);
    if (amount < 0 || !Number.isSafeInteger(amount)) return;
    setPlan((current) => ({ ...current, monthlyIncomeMinor: amount, updatedAt: new Date().toISOString() }));
  };
  const setHousehold = () => {
    const adults = Number(adultsInput); const children = Number(childrenInput);
    if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0 || adults + children < 1 || adults > 30 || children > 30) return;
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

      <div className="kenz-family-summary-grid">
        <article><span>{t(profile, 'Revenu mensuel', 'الدخل الشهري', 'Monthly income')}</span><strong>{formatMoney(summary.incomeMinor, profile.preferredCurrency, profile.locale)}</strong></article>
        <article><span>{t(profile, 'Budget planifié', 'الميزانية المخططة', 'Planned budget')}</span><strong>{formatMoney(summary.plannedMinor, profile.preferredCurrency, profile.locale)}</strong></article>
        <article><span>{t(profile, 'Dépenses réelles', 'المصروف الفعلي', 'Actual spending')}</span><strong>{formatMoney(summary.actualMinor, profile.preferredCurrency, profile.locale)}</strong></article>
      </div>

      <div className="kenz-family-panel space-y-3">
        <div className="kenz-section-heading"><div><span className="kenz-card-kicker">{t(profile, 'CONFIGURATION', 'الإعدادات', 'SETUP')}</span><h3>{t(profile, 'Votre foyer', 'أسرتك', 'Your household')}</h3></div><span className="text-xs text-slate-500">{saveState === 'saved' ? t(profile, 'Enregistré sur cet appareil', 'محفوظ على هذا الجهاز', 'Saved on this device') : t(profile, 'Stockage indisponible', 'التخزين غير متاح', 'Storage unavailable')}</span></div>
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
        <p className="text-xs text-slate-500">{t(profile, 'Saisissez un montant prévu et mettez à jour le réel au fil du mois. Toutes les valeurs restent modifiables.', 'أدخل المبلغ المخطط وحدّث المصروف الفعلي خلال الشهر. كل القيم قابلة للتعديل.', 'Enter a planned amount and update actual spending during the month. Every amount is editable.')}</p>
        <div className="space-y-2">
          {plan.categories.map((row) => {
            const item = labels[row.id]; const Icon = item.icon;
            const remaining = row.plannedMinor - row.actualMinor;
            return <article className="kenz-family-category" key={row.id}>
              <div className="kenz-family-category-title"><span><Icon /></span><strong>{item[profile.locale]}</strong><small>{formatMoney(remaining, profile.preferredCurrency, profile.locale)} {t(profile, 'restant', 'متبقٍ', 'left')}</small></div>
              <div className="grid grid-cols-2 gap-2">
                <label>{t(profile, 'Prévu', 'مخطط', 'Planned')}<input inputMode="decimal" value={moneyInput(row.plannedMinor)} onChange={(e) => updatePlan('plannedMinor', row.id, Math.max(0, parseToMinorUnits(e.target.value)))} className="w-full h-10 px-3 mt-1 rounded-lg border text-sm font-mono-numbers" /></label>
                <label>{t(profile, 'Réel', 'فعلي', 'Actual')}<input inputMode="decimal" value={moneyInput(row.actualMinor)} onChange={(e) => updatePlan('actualMinor', row.id, Math.max(0, parseToMinorUnits(e.target.value)))} className="w-full h-10 px-3 mt-1 rounded-lg border text-sm font-mono-numbers" /></label>
              </div>
            </article>;
          })}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{t(profile, 'Les données familiales sont privées et restent locales sur cet appareil dans cette première étape. La synchronisation multi-appareils sera ajoutée après validation du modèle.', 'بيانات الأسرة خاصة ومحفوظة محلياً على هذا الجهاز في هذه المرحلة. ستضاف المزامنة بين الأجهزة بعد اعتماد النموذج.', 'Family data is private and stays on this device in this first stage. Multi-device sync will follow after the model is validated.')}</p>
    </section>
  );
};
