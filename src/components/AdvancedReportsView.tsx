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
  const chartPoints = monthly.map((item, index) => {const x = monthly.length > 1 ? 30 + index * 300 / (monthly.length - 1) : 180;const scale = Math.max(1, maxChart);return {key:item.key,x,incomeY:136 - item.income / scale * 112,expenseY:136 - item.expense / scale * 112};});
  const incomeLine = chartPoints.map((point) => point.x + ',' + point.incomeY).join(' ');
  const expenseLine = chartPoints.map((point) => point.x + ',' + point.expenseY).join(' ');
  let donutProgress = 0;
  const donutStops = categoriesSpend.slice(0, 6).map((category) => {const start = donutProgress;donutProgress += category.amount / Math.max(1, expenses) * 100;return (category.color || '#6b35d4') + ' ' + start + '% ' + Math.min(100, donutProgress) + '%';}).join(', ');
  return (
    <div className="kenz-page kenz-reports-page space-y-5 pb-24" dir={isArabic ? 'rtl' : 'ltr'}>
      <header className="kenz-report-heading"><div><span className="kenz-eyebrow"><BarChart3 /> KENZ INSIGHTS</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><button onClick={onExportCSV} className="kenz-export-button"><Download /><span>{t.export}</span></button></header>
      <section className="kenz-report-controls"><div className="kenz-report-control-top"><span><CalendarRange />{t.period}</span><label>{t.currency}<select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></label></div><div className="kenz-range-tabs">{(['1M','3M','6M','1A','ALL'] as RangeKey[]).map((key, i) => <button key={key} onClick={() => setRange(key)} className={range === key ? 'active' : ''}>{[t.month,t.three,t.six,t.year,t.all][i]}</button>)}</div></section>
      <section className="kenz-report-metrics"><article className="kenz-metric-card"><span><ArrowUpRight />{t.income}</span><strong>{money(income,currency,locale)}</strong></article><article className="kenz-metric-card"><span><ArrowDownRight />{t.expenses}</span><strong>{money(expenses,currency,locale)}</strong>{change !== null && <small>{fmtPct(change)} {t.vsPrevious}</small>}</article><article className="kenz-metric-card kenz-net-card"><span><Wallet />{t.net}</span><strong>{money(net,currency,locale)}</strong></article></section>
      {count === 0 ? <section className="kenz-empty-card kenz-report-empty"><BarChart3 /><h2>{t.noData}</h2><p>{t.noDataHint}</p></section> : <>
        <section className="kenz-chart-card"><div className="kenz-section-heading"><div><span className="kenz-card-kicker">{profile?.locale === 'en' ? 'CASH FLOW' : profile?.locale === 'ar' ? 'التدفق النقدي' : 'FLUX DE TRÉSORERIE'}</span><h2>{t.trend}</h2></div><div className="kenz-chart-legend"><span><i className="kenz-legend-income" />{t.income}</span><span><i className="kenz-legend-expense" />{t.expenses}</span></div></div><div className="kenz-line-chart"><div className="kenz-chart-grid"><span>{money(maxChart,currency,locale)}</span><span>{money(maxChart/2,currency,locale)}</span><span>0</span></div><svg viewBox="0 0 360 150" role="img" aria-label={t.trend} preserveAspectRatio="none"><defs><linearGradient id="kenzIncomeFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#21b58a" stopOpacity=".2"/><stop offset="100%" stopColor="#21b58a" stopOpacity="0"/></linearGradient></defs><line x1="30" y1="24" x2="330" y2="24"/><line x1="30" y1="80" x2="330" y2="80"/><line x1="30" y1="136" x2="330" y2="136"/><polygon points={'30,136 ' + incomeLine + ' 330,136'} fill="url(#kenzIncomeFill)"/><polyline points={incomeLine} className="kenz-income-line"/><polyline points={expenseLine} className="kenz-expense-line"/>{chartPoints.map((point) => <g key={point.key}><circle cx={point.x} cy={point.incomeY} r="3.5" className="kenz-income-dot"/><circle cx={point.x} cy={point.expenseY} r="3.5" className="kenz-expense-dot"/></g>)}</svg></div><div className="kenz-chart-labels">{monthly.map((item) => <span key={item.key}>{monthLabel(item.key,locale)}</span>)}</div><p className="kenz-chart-note">{t.transfersExcluded}</p></section>
        <section className="kenz-category-card"><div className="kenz-section-heading"><div><span className="kenz-card-kicker">{profile?.locale === 'en' ? 'WHERE IT GOES' : profile?.locale === 'ar' ? 'توزيع المصاريف' : 'RÉPARTITION'}</span><h2>{t.breakdown}</h2></div></div><div className="kenz-category-layout">{categoriesSpend.length === 0 ? <p className="kenz-empty-copy">—</p> : <><div className="kenz-donut-wrap"><div className="kenz-donut" style={{background: 'conic-gradient(' + (donutStops || '#e9e4f4 0% 100%') + ')'}}><div><strong>{money(expenses,currency,locale)}</strong><span>{t.expenses}</span></div></div></div><div className="kenz-category-list">{categoriesSpend.slice(0,6).map(cat => <div key={cat.id} className="kenz-category-row"><i style={{backgroundColor:cat.color || '#6b35d4'}}/><span>{cat.name}</span><b>{Math.round(cat.amount/Math.max(1,expenses)*100)}%</b><small>{money(cat.amount,currency,locale)}</small></div>)}</div></>}</div></section>
        <section className="kenz-report-footer"><article><span>{t.average}</span><strong>{money(average,currency,locale)}</strong></article><article><span>{t.top}</span><strong>{topCategory?.name || '—'}</strong><small>{topCategory ? money(topCategory.amount,currency,locale) : '—'}</small></article></section>
      </>}
    </div>
  };
