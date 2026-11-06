import React from 'react';
import {
  Wallet,
  Calendar,
  AlertTriangle,
  PiggyBank,
  ArrowRight,
  ShieldCheck,
  PlusCircle,
  Sparkles,
  BookOpen,
  ScanLine,
  BarChart3,
} from 'lucide-react';
import {
  Account,
  Transaction,
  RecurringItem,
  SavingsGoal,
  SafeToSpendBreakdown,
  UserProfile,
  DebtEntry,
} from '../domain/types';
import {
  formatMoney,
  calculateAccountBalance,
  generateDeterministicWeeklySummary,
} from '../domain/financialCalculations';
import { calculateDebtSummary, calculateFinancialHealthScore } from '../services/debtStore';
import { daysUntilBill, formatBillDueLabel } from '../services/billReminderService';

interface HomeViewProps {
  profile: UserProfile;
  accounts: Account[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  safeToSpend: SafeToSpendBreakdown;
  debts?: DebtEntry[];
  onOpenAddModal: () => void;
  onOpenAIModal?: () => void;
  onNavigate: (tab: 'transactions' | 'plan' | 'settings' | 'nearby' | 'debts' | 'reports') => void;
  onOpenReceiptScanner: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  accounts,
  transactions,
  recurringItems,
  savingsGoals,
  safeToSpend,
  debts = [],
  onOpenAddModal,
  onOpenAIModal,
  onNavigate,
  onOpenReceiptScanner,
}) => {
  const weeklySummary = generateDeterministicWeeklySummary({
    transactions,
    safeToSpend,
    todayDate: new Date(),
  });

  const isShortfall = safeToSpend.safeToSpendMinor < 0;

  // Upcoming unpaid bills
  const upcomingBills = recurringItems
    .filter((i) => i.isActive && i.type === 'expense')
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, 3);

  // Active savings goals
  const activeGoals = savingsGoals.filter((g) => g.status === 'active');

  return (
    <div className="kenz-page kenz-home-page space-y-6 pb-24">
      <header className="kenz-home-greeting">
        <div><span className="kenz-eyebrow">KENZ FINANCE</span><h1>{profile.locale === 'ar' ? 'أهلاً' : profile.locale === 'en' ? 'Hello' : 'Bonjour'}, {profile.displayName || 'Titou'} <span aria-hidden="true">👋</span></h1><p>{profile.locale === 'ar' ? 'إليك ملخص أموالك اليوم' : profile.locale === 'en' ? 'Here’s your money at a glance.' : 'Voici votre situation financière aujourd’hui.'}</p></div>
        <button type="button" className="kenz-avatar-button" onClick={() => onNavigate('settings')} aria-label="Ouvrir les paramètres">{(profile.displayName || 'K').slice(0, 1).toUpperCase()}</button>
      </header>

      <section className="kenz-balance-card">
        <div className="kenz-balance-top"><span>{profile.locale === 'ar' ? 'المتاح للإنفاق' : profile.locale === 'en' ? 'Safe to spend' : 'Reste à vivre disponible'}</span><span className="kenz-balance-currency">{profile.preferredCurrency}</span></div>
        <div className="kenz-balance-amount">{formatMoney(safeToSpend.safeToSpendMinor, profile.preferredCurrency, profile.locale)}</div>
        <p className="kenz-balance-caption">{isShortfall ? (profile.locale === 'ar' ? 'هناك عجز قبل موعد الراتب القادم.' : profile.locale === 'en' ? 'A shortfall is projected before payday.' : 'Un déficit est prévu avant la prochaine paye.') : (profile.locale === 'ar' ? 'بعد احتساب الفواتير والمدخرات.' : profile.locale === 'en' ? 'After upcoming bills and savings.' : 'Après prise en compte des factures et de l’épargne.')}</p>
        <div className="kenz-balance-details"><div><span>{profile.locale === 'ar' ? 'الحد اليومي' : profile.locale === 'en' ? 'Daily guideline' : 'Repère quotidien'}</span><strong>{formatMoney(safeToSpend.dailyGuidelineMinor, profile.preferredCurrency, profile.locale)}</strong></div><div><span>{profile.locale === 'ar' ? 'السيولة الإجمالية' : profile.locale === 'en' ? 'Liquid funds' : 'Trésorerie totale'}</span><strong>{formatMoney(safeToSpend.availableBalanceMinor, profile.preferredCurrency, profile.locale)}</strong></div><div><span>{profile.locale === 'ar' ? 'موعد الراتب' : profile.locale === 'en' ? 'Payday' : 'Prochaine paye'}</span><strong>{safeToSpend.isPaydayConfigured ? (profile.locale === 'en' ? 'In ' + safeToSpend.daysUntilPayday + ' days' : profile.locale === 'ar' ? 'بعد ' + safeToSpend.daysUntilPayday + ' يوم' : 'Dans ' + safeToSpend.daysUntilPayday + ' j') : (profile.locale === 'en' ? '30-day period' : profile.locale === 'ar' ? 'فترة 30 يوماً' : 'Période 30 jours')}</strong></div></div>
      </section>

      <section className="kenz-quick-actions" aria-label="Actions rapides">
        <button type="button" onClick={onOpenAddModal}><span className="kenz-action-icon kenz-action-purple"><PlusCircle /></span><span>{profile.locale === 'en' ? 'Add expense' : profile.locale === 'ar' ? 'إضافة مصروف' : 'Ajouter une dépense'}</span></button>
        <button type="button" onClick={onOpenReceiptScanner}><span className="kenz-action-icon kenz-action-green"><ScanLine /></span><span>{profile.locale === 'en' ? 'Scan receipt' : profile.locale === 'ar' ? 'مسح إيصال' : 'Scanner un reçu'}</span></button>
        <button type="button" onClick={() => onNavigate('plan')}><span className="kenz-action-icon kenz-action-amber"><PiggyBank /></span><span>{profile.locale === 'en' ? 'My budgets' : profile.locale === 'ar' ? 'ميزانياتي' : 'Mes budgets'}</span></button>
        <button type="button" onClick={() => onNavigate('reports')}><span className="kenz-action-icon kenz-action-blue"><BarChart3 /></span><span>{profile.locale === 'en' ? 'Reports' : profile.locale === 'ar' ? 'التقارير' : 'Rapports'}</span></button>
      </section>

      <section className="kenz-insight-card"><div className="kenz-insight-icon">{isShortfall ? <AlertTriangle /> : <ShieldCheck />}</div><div><span className="kenz-card-kicker">{profile.locale === 'en' ? 'YOUR WEEKLY INSIGHT' : profile.locale === 'ar' ? 'ملخص الأسبوع' : 'VOTRE POINT DE LA SEMAINE'}</span><p>{weeklySummary.actionableObservation}</p></div>{onOpenAIModal && <button type="button" onClick={onOpenAIModal} className="kenz-ai-button"><Sparkles /> <span>Coach IA</span></button>}</section>

      {activeGoals.length > 0 && <section className="kenz-section"><div className="kenz-section-heading"><div><span className="kenz-card-kicker">{profile.locale === 'en' ? 'SAVINGS' : profile.locale === 'ar' ? 'الادخار' : 'ÉPARGNE'}</span><h2>{profile.locale === 'en' ? 'Your goals' : profile.locale === 'ar' ? 'أهدافك' : 'Vos objectifs'}</h2></div><button type="button" onClick={() => onNavigate('plan')}>{profile.locale === 'en' ? 'See all' : profile.locale === 'ar' ? 'عرض الكل' : 'Tout voir'} <ArrowRight /></button></div><div className="kenz-goal-list">{activeGoals.slice(0, 2).map((goal) => {const progressPct = Math.min(100, Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100));return <article className="kenz-goal-card" key={goal.id}><div className="kenz-goal-title"><span className="kenz-goal-icon"><PiggyBank /></span><div><strong>{goal.name}</strong><small>{formatMoney(goal.currentAmountMinor, goal.currency, profile.locale)} / {formatMoney(goal.targetAmountMinor, goal.currency, profile.locale)}</small></div><b>{progressPct}%</b></div><div className="kenz-progress-track"><span style={{width: progressPct + '%'}} /></div></article>})}</div></section>}

      <section className="kenz-section"><div className="kenz-section-heading"><div><span className="kenz-card-kicker">{profile.locale === 'en' ? 'COMING UP' : profile.locale === 'ar' ? 'قريباً' : 'À VENIR'}</span><h2>{profile.locale === 'en' ? 'Upcoming bills' : profile.locale === 'ar' ? 'الفواتير القادمة' : 'Prochaines factures'}</h2></div><button type="button" onClick={() => onNavigate('plan')}>{profile.locale === 'en' ? 'See all' : profile.locale === 'ar' ? 'عرض الكل' : 'Tout voir'} <ArrowRight /></button></div>{upcomingBills.length === 0 ? <div className="kenz-empty-card">{profile.locale === 'en' ? 'No upcoming bills in this period.' : profile.locale === 'ar' ? 'لا توجد فواتير قادمة في هذه الفترة.' : 'Aucune facture prévue pour le moment.'}</div> : <div className="kenz-list-card">{upcomingBills.map((bill) => <article key={bill.id} className="kenz-list-row"><span className="kenz-row-icon kenz-action-amber"><Calendar /></span><div className="kenz-row-copy"><strong>{bill.name}</strong><small>{formatBillDueLabel(bill.nextDueDate, profile.locale)} · {bill.nextDueDate}</small></div><b>{formatMoney(bill.amountMinor, bill.currency, profile.locale)}</b></article>)}</div>}</section>

      <section className="kenz-section"><div className="kenz-section-heading"><div><span className="kenz-card-kicker">{profile.locale === 'en' ? 'YOUR ACCOUNTS' : profile.locale === 'ar' ? 'حساباتك' : 'VOS COMPTES'}</span><h2>{profile.locale === 'en' ? 'Tracked accounts' : profile.locale === 'ar' ? 'الحسابات المتابعة' : 'Comptes suivis'} <span className="kenz-count">{accounts.length}</span></h2></div><button type="button" onClick={() => onNavigate('settings')}>{profile.locale === 'en' ? 'Manage' : profile.locale === 'ar' ? 'إدارة' : 'Gérer'} <ArrowRight /></button></div><div className="kenz-account-grid">{accounts.map((acc) => {const bal = calculateAccountBalance(acc, transactions);return <article key={acc.id} className="kenz-account-card"><span className="kenz-account-icon"><Wallet /></span><div className="kenz-row-copy"><strong>{acc.name}</strong><small>{acc.type}</small></div><b>{formatMoney(bal, acc.currency, profile.locale)}</b></article>})}</div></section>

      {(() => {const debtSummary = calculateDebtSummary(debts);const health = calculateFinancialHealthScore({safeToSpend,accounts,transactions,savingsGoals,debts});return <section className="kenz-financial-health" onClick={() => onNavigate('debts')} role="button" tabIndex={0} onKeyDown={(event) => {if (event.key === 'Enter' || event.key === ' ') onNavigate('debts');}}><div className="kenz-health-heading"><span className="kenz-health-icon"><BookOpen /></span><div className="kenz-row-copy"><strong>{profile.locale === 'en' ? 'Kredy & financial health' : profile.locale === 'ar' ? 'دفتر الديون والصحة المالية' : 'Carnet Kredy & santé financière'}</strong><small>{profile.locale === 'en' ? 'Your financial health score' : profile.locale === 'ar' ? 'مؤشر صحتك المالية' : 'Votre indice de santé financière'}</small></div><span className="kenz-health-score">{health.score}<small>/100</small></span><ArrowRight /></div><div className="kenz-debt-stats"><div><small>{profile.locale === 'en' ? 'You owe' : profile.locale === 'ar' ? 'عليك' : 'Je dois'}</small><b className="kenz-negative">{formatMoney(debtSummary.totalPayableMinor, profile.preferredCurrency, profile.locale)}</b></div><div><small>{profile.locale === 'en' ? 'Owed to you' : profile.locale === 'ar' ? 'مستحق لك' : 'On me doit'}</small><b className="kenz-positive">{formatMoney(debtSummary.totalReceivableMinor, profile.preferredCurrency, profile.locale)}</b></div></div></section>})()}

      <details className="kenz-breakdown"><summary>{profile.locale === 'en' ? 'How your available amount is calculated' : profile.locale === 'ar' ? 'كيف تم حساب المبلغ المتاح' : 'Comment est calculé votre reste à vivre'}</summary><div className="kenz-breakdown-rows"><div><span>{profile.locale === 'en' ? 'Available bank and cash balance' : profile.locale === 'ar' ? 'الأرصدة المتاحة' : 'Soldes bancaires et espèces'}</span><b>{formatMoney(safeToSpend.availableBalanceMinor, profile.preferredCurrency, profile.locale)}</b></div><div><span>{profile.locale === 'en' ? 'Expected income before payday' : profile.locale === 'ar' ? 'الدخل المتوقع' : 'Revenus attendus avant la paye'}</span><b className="kenz-positive">+{formatMoney(safeToSpend.expectedIncomeMinor, profile.preferredCurrency, profile.locale)}</b></div><div><span>{profile.locale === 'en' ? 'Reserved bills and commitments' : profile.locale === 'ar' ? 'الفواتير والالتزامات' : 'Factures et charges réservées'}</span><b className="kenz-warning">−{formatMoney(safeToSpend.unpaidReservedCommitmentsMinor, profile.preferredCurrency, profile.locale)}</b></div><div><span>{profile.locale === 'en' ? 'Planned savings' : profile.locale === 'ar' ? 'الادخار المخطط' : 'Épargne prévue'}</span><b className="kenz-warning">−{formatMoney(safeToSpend.plannedSavingsMinor, profile.preferredCurrency, profile.locale)}</b></div></div></details>
    </div>
  );
};
