import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarRange, Download, Wallet } from 'lucide-react';
import { Category, Transaction, UserProfile } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';

type RangeKey = '1M' | '3M' | '6M' | '1A' | 'ALL';
interface Props {
  transactions: Transaction[];
  categories: Category[];
  profile: UserProfile;
  onExportCSV: () => void;
}
const copy = {
  fr: {
    title: 'Rapports avancés', subtitle: 'Comprenez vos habitudes et suivez votre évolution.',
    period: 'Période', income: 'Revenus', expenses: 'Dépenses', net: 'Solde net',
    trend: 'Évolution mensuelle', breakdown: 'Dépenses par catégorie', comparison: 'Comparaison',
    vsPrevious: 'vs période précédente', noData: 'Pas encore assez de données',
    noDataHint: 'Ajoutez des opérations pour voir apparaître vos tendances financières.',
    currency: 'Devise', all: 'Tout', month: '1 mois', three: '3 mois', six: '6 mois', year: '1 an',
    transactions: 'opérations', average: 'Moyenne mensuelle', top: 'Principale catégorie',
    incomeVsExpense: 'Revenus / Dépenses', noCategory: 'Sans catégorie', export: 'Exporter CSV',
    positive: 'En hausse', negative: 'En baisse', same: 'Stable', previous: 'Période précédente',
    transfersExcluded: 'Les virements entre vos comptes sont exclus des revenus et dépenses.',
  },
  ar: {
    title: 'التقارير المتقدمة', subtitle: 'افهم عاداتك المالية وتابع تطورها.',
    period: 'الفترة', income: 'المداخيل', expenses: 'المصاريف', net: 'الصافي',
    trend: 'التطور الشهري', breakdown: 'المصاريف حسب الفئة', comparison: 'المقارنة',
    vsPrevious: 'مقارنة بالفترة السابقة', noData: 'لا توجد بيانات كافية بعد',
    noDataHint: 'أضف عمليات مالية لعرض تحليلاتك واتجاهاتك.',
    currency: 'العملة', all: 'الكل', month: 'شهر', three: '3 أشهر', six: '6 أشهر', year: 'سنة',
    transactions: 'عملية', average: 'المعدل الشهري', top: 'أكبر فئة', incomeVsExpense: 'المداخيل / المصاريف',
    noCategory: 'بدون فئة', export: 'تصدير CSV', positive: 'ارتفاع', negative: 'انخفاض',
    same: 'مستقر', previous: 'الفترة السابقة',
    transfersExcluded: 'التحويلات بين حساباتك مستبعدة من المداخيل والمصاريف.',
  },
};
const arabicCategory: Record<string, string> = {
  'alimentation & marché': 'الغذاء والتسوق', 'loyer & logement': 'الإيجار والسكن',
  'factures (sonelgaz, eau, net)': 'الفواتير', 'transport & carburant': 'النقل والوقود',
  'santé & pharmacie': 'الصحة والصيدلة', 'famille & enfants': 'العائلة والأطفال',
  'salaire / revenu principal': 'الراتب / الدخل الرئيسي', 'revenu complémentaire': 'دخل إضافي',
};
const money = (amount: number, currency: string, locale: string) => formatMoney(amount, currency, locale);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string, locale: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', { month: 'short' }).format(new Date(y, m - 1, 1));
};
export const AdvancedReportsView: React.FC<Props> = ({ transactions, categories, profile, onExportCSV }) => {
  const locale = profile.locale === 'ar' ? 'ar' : 'fr';
  const t = copy[locale];
  const [range, setRange] = useState<RangeKey>('6M');
  const [currency, setCurrency] = useState(profile.preferredCurrency);
  const isArabic = locale === 'ar';
  const today = new Date();
  const currentMonth = monthKey(today);
  const currencies = Array.from(new Set([profile.preferredCurrency, ...transactions.map(x => x.currency)])).sort();
  const startMonth = useMemo(() => {
    if (range === 'ALL') return '';
    const date = new Date(today.getFullYear(), today.getMonth() - (range === '1M' ? 0 : range === '3M' ? 2 : range === '6M' ? 5 : 11), 1);
    return monthKey(date);
  }, [range, currentMonth]);
  const selected = useMemo(() => transactions.filter(tx =>
    tx.currency === currency && tx.type !== 'transfer' && tx.transactionDate.slice(0, 7) <= currentMonth &&
    (!startMonth || tx.transactionDate.slice(0, 7) >= startMonth)
  ), [transactions, currency, currentMonth, startMonth]);
  const income = selected.filter(x => x.type === 'income').reduce((s, x) => s + x.amountMinor, 0);
  const expenses = selected.filter(x => x.type === 'expense').reduce((s, x) => s + x.amountMinor, 0);
  const net = income - expenses;
  const priorMonths = range === '1M' ? 1 : range === '3M' ? 3 : range === '6M' ? 6 : 12;
  const previousStart = range === 'ALL' ? '' : monthKey(new Date(today.getFullYear(), today.getMonth() - priorMonths * 2 + 1, 1));
  const previousEnd = range === 'ALL' ? '' : monthKey(new Date(today.getFullYear(), today.getMonth() - priorMonths, 1));
  const previous = range === 'ALL' ? [] : transactions.filter(tx => tx.currency === currency && tx.type !== 'transfer' &&
    tx.transactionDate.slice(0, 7) >= previousStart && tx.transactionDate.slice(0, 7) <= previousEnd);
  const previousExpense = previous.filter(x => x.type === 'expense').reduce((s, x) => s + x.amountMinor, 0);
  const change = previousExpense > 0 ? Math.round(((expenses - previousExpense) / previousExpense) * 100) : null;
  const months = useMemo(() => {
    const keys: string[] = [];
    const first = range === 'ALL'
      ? (selected.length ? selected.reduce((min, x) => x.transactionDate.slice(0, 7) < min ? x.transactionDate.slice(0, 7) : min, currentMonth) : currentMonth)
      : startMonth;
    const [fy, fm] = first.split('-').map(Number);
    const [cy, cm] = currentMonth.split('-').map(Number);
    let cursor = new Date(fy, (fm || cm) - 1, 1);
    const end = new Date(cy, cm - 1, 1);
    while (cursor <= end && keys.length < 120) { keys.push(monthKey(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
    return keys;
  }, [range, startMonth, currentMonth, selected]);
  const monthly = months.map(key => {
    const rows = selected.filter(x => x.transactionDate.slice(0, 7) === key);
    return { key, income: rows.filter(x => x.type === 'income').reduce((s, x) => s + x.amountMinor, 0), expense: rows.filter(x => x.type === 'expense').reduce((s, x) => s + x.amountMinor, 0) };
  });
  const categoriesSpend = useMemo(() => {
    const totals = new Map<string, number>();
    selected.filter(x => x.type === 'expense').forEach(x => totals.set(x.categoryId || 'none', (totals.get(x.categoryId || 'none') || 0) + x.amountMinor));
    return Array.from(totals.entries()).map(([id, amount]) => {
      const cat = categories.find(c => c.id === id);
      const name = cat?.name || t.noCategory;
      return { id, name: isArabic ? (arabicCategory[name.toLocaleLowerCase()] || name) : name, amount, color: cat?.color || '#8b5cf6' };
    }).sort((a, b) => b.amount - a.amount);
  }, [selected, categories, isArabic, t.noCategory]);
  const maxCategory = Math.max(1, ...categoriesSpend.map(x => x.amount));
  const maxChart = Math.max(1, ...monthly.flatMap(x => [x.income, x.expense]));
  const count = selected.length;
  const average = months.length ? Math.round(expenses / months.length) : expenses;
  const topCategory = categoriesSpend[0];
  const fmtPct = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`;
  return (
    <div className="space-y-5 pb-24" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-violet-300 text-xs font-semibold"><BarChart3 className="w-4 h-4" /> KENZ INSIGHTS</div>
          <h1 className="text-2xl font-bold text-white mt-1">{t.title}</h1><p className="text-sm text-slate-400 mt-1">{t.subtitle}</p></div>
        <button onClick={onExportCSV} className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 min-h-[44px]"><Download className="w-4 h-4" /><span className="hidden sm:inline">{t.export}</span></button>
      </header>
      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-lg shadow-violet-950/10">
        <div className="flex items-center justify-between gap-3 mb-3"><span className="text-xs font-semibold text-slate-300 flex items-center gap-2"><CalendarRange className="w-4 h-4 text-violet-300" />{t.period}</span>
          <label className="text-[11px] text-slate-400 flex items-center gap-2">{t.currency}<select value={currency} onChange={e => setCurrency(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">{currencies.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-950/80 p-1">
          {(['1M','3M','6M','1A','ALL'] as RangeKey[]).map((key, i) => <button key={key} onClick={() => setRange(key)} className={`rounded-lg px-1 py-2 text-[11px] font-semibold transition ${range === key ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{[t.month,t.three,t.six,t.year,t.all][i]}</button>)}
        </div>
      </section>
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <article className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 to-slate-900 p-4"><div className="flex items-center gap-2 text-xs text-emerald-300"><ArrowUpRight className="w-4 h-4" />{t.income}</div><div className="text-lg sm:text-xl font-bold text-white font-mono-numbers mt-2">{money(income,currency,locale)}</div></article>
        <article className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/15 to-slate-900 p-4"><div className="flex items-center gap-2 text-xs text-rose-300"><ArrowDownRight className="w-4 h-4" />{t.expenses}</div><div className="text-lg sm:text-xl font-bold text-white font-mono-numbers mt-2">{money(expenses,currency,locale)}</div>{change !== null && <div className={`mt-1 text-[11px] ${change > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{fmtPct(change)} {t.vsPrevious}</div>}</article>
        <article className="col-span-2 sm:col-span-1 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-slate-900 p-4"><div className="flex items-center gap-2 text-xs text-violet-200"><Wallet className="w-4 h-4" />{t.net}</div><div className={`text-lg sm:text-xl font-bold mt-2 font-mono-numbers ${net >= 0 ? 'text-white' : 'text-rose-300'}`}>{money(net,currency,locale)}</div></article>
      </section>
      {count === 0 ? <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center"><BarChart3 className="w-9 h-9 text-violet-300 mx-auto mb-3" /><h2 className="font-semibold text-white">{t.noData}</h2><p className="text-sm text-slate-400 mt-2">{t.noDataHint}</p></section> : <>
        <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-white">{t.trend}</h2><div className="flex gap-3 text-[10px] text-slate-400"><span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-400" />{t.income}</span><span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-violet-400" />{t.expenses}</span></div></div>
          <div className="h-44 flex items-end gap-1.5 border-b border-slate-700/80 pb-2">{monthly.map(m => <div key={m.key} className="flex-1 min-w-0 h-full flex items-end justify-center gap-0.5 group" title={`${monthLabel(m.key,locale)}: ${money(m.income,currency,locale)} / ${money(m.expense,currency,locale)}`}><div className="w-2/5 max-w-5 rounded-t bg-emerald-400/90" style={{height:`${Math.max(m.income ? 3 : 0,m.income/maxChart*100)}%`}} /><div className="w-2/5 max-w-5 rounded-t bg-violet-400/90" style={{height:`${Math.max(m.expense ? 3 : 0,m.expense/maxChart*100)}%`}} /></div>)}</div>
          <div className="flex gap-1.5">{monthly.map(m => <span key={m.key} className="flex-1 min-w-0 text-center text-[9px] text-slate-500 truncate">{monthLabel(m.key,locale)}</span>)}</div>
          <p className="text-[11px] text-slate-500">{t.transfersExcluded}</p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 space-y-4">
          <h2 className="font-semibold text-white">{t.breakdown}</h2>
          {categoriesSpend.length === 0 ? <p className="text-sm text-slate-400">—</p> : categoriesSpend.slice(0,8).map(cat => <div key={cat.id} className="space-y-1.5"><div className="flex justify-between gap-3 text-xs"><span className="text-slate-200 truncate">{cat.name}</span><span className="text-white font-semibold font-mono-numbers">{Math.round(cat.amount/Math.max(1,expenses)*100)}% · {money(cat.amount,currency,locale)}</span></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{width:`${cat.amount/maxCategory*100}%`,backgroundColor:cat.color}} /></div></div>)}
        </section>
        <section className="grid grid-cols-2 gap-3">
          <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-4"><div className="text-xs text-slate-400">{t.average}</div><div className="text-base font-bold text-white mt-2 font-mono-numbers">{money(average,currency,locale)}</div></article>
          <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-4"><div className="text-xs text-slate-400">{t.top}</div><div className="text-sm font-bold text-white mt-2 truncate">{topCategory?.name || '—'}</div><div className="text-xs text-slate-400 mt-1">{topCategory ? money(topCategory.amount,currency,locale) : '—'}</div></article>
        </section>
      </>}
    </div>
  );
};
