import React from 'react';
import {
  Wallet,
  Calendar,
  AlertTriangle,
  PiggyBank,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  PlusCircle,
  Sparkles,
  BookOpen,
  Activity,
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
  onNavigate: (tab: 'transactions' | 'plan' | 'settings' | 'nearby' | 'debts') => void;
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
    .slice(0, 3);

  // Active savings goals
  const activeGoals = savingsGoals.filter((g) => g.status === 'active');

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Main Safe to Spend Hero Card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Reste à vivre disponible</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-300 font-medium">
              {safeToSpend.isPaydayConfigured
                ? `Paye dans ${safeToSpend.daysUntilPayday} jours`
                : `Période 30 jours`}
            </span>
          </div>
          <span className="text-slate-400 font-mono-numbers text-[11px]">
            {profile.preferredCurrency}
          </span>
        </div>

        {/* Big Safe-To-Spend Figure */}
        <div className="mt-3">
          <div
            className={`text-3xl sm:text-4xl font-bold font-mono-numbers tracking-tight ${
              isShortfall ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {formatMoney(safeToSpend.safeToSpendMinor, profile.preferredCurrency, profile.locale)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isShortfall
              ? 'Déficit budgétaire détecté avant la prochaine paye.'
              : 'Montant disponible en toute sécurité après déduction des factures et de l’épargne.'}
          </p>
        </div>

        {/* Daily Spending Guideline */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] text-slate-500 block">Plafond quotidien conseillé</span>
            <span className="text-lg font-semibold font-mono-numbers text-slate-200">
              {formatMoney(safeToSpend.dailyGuidelineMinor, profile.preferredCurrency, profile.locale)}
              <span className="text-xs font-normal text-slate-400"> /jour</span>
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-500 block">Trésorerie liquide totale</span>
            <span className="text-lg font-semibold font-mono-numbers text-slate-200">
              {formatMoney(safeToSpend.availableBalanceMinor, profile.preferredCurrency, profile.locale)}
            </span>
          </div>
        </div>

        {/* Action Button Row */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onOpenAddModal}
            className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Enregistrer dépense</span>
          </button>

          {onOpenAIModal && (
            <button
              onClick={onOpenAIModal}
              className="px-3.5 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-xs border border-slate-700/80 transition-colors cursor-pointer min-h-[44px]"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Coach IA</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Actionable Observation (Deterministic) */}
      <section className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 shrink-0">
            {isShortfall ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-200">Conseil de gestion de trésorerie</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              {weeklySummary.actionableObservation}
            </p>
          </div>
        </div>
      </section>

      {/* 2b. Phase 5: Carnet Kredy & Santé Financière */}
      {(() => {
        const debtSummary = calculateDebtSummary(debts);
        const health = calculateFinancialHealthScore({
          safeToSpend,
          accounts,
          transactions,
          savingsGoals,
          debts,
        });
        return (
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200">
                    Carnet Kredy & Santé Financière
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Phase 5 · Score {health.score}/100 ({health.grade})
                  </span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('debts')}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 min-h-[44px] flex items-center gap-1 cursor-pointer"
              >
                <span>Voir le carnet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">Je dois (Ardoises)</span>
                <span className="font-mono-numbers font-bold text-rose-300 text-xs">
                  {formatMoney(debtSummary.totalPayableMinor, profile.preferredCurrency)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">On me doit (Créances)</span>
                <span className="font-mono-numbers font-bold text-emerald-300 text-xs">
                  {formatMoney(debtSummary.totalReceivableMinor, profile.preferredCurrency)}
                </span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* 3. Breakdown of Deductions */}
      <section className="rounded-2xl bg-slate-900/40 border border-slate-800 p-5 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Calcul transparent du reste à vivre
        </h3>

        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-800/60">
            <span className="text-slate-400">Solde bancaire & espèces disponible</span>
            <span className="font-mono-numbers font-medium text-slate-200">
              {formatMoney(safeToSpend.availableBalanceMinor, profile.preferredCurrency, profile.locale)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-800/60">
            <span className="text-slate-400">+ Revenus attendus avant la paye</span>
            <span className="font-mono-numbers font-medium text-emerald-400">
              +{formatMoney(safeToSpend.expectedIncomeMinor, profile.preferredCurrency, profile.locale)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-800/60">
            <span className="text-slate-400">- Factures et charges réservées à payer</span>
            <span className="font-mono-numbers font-medium text-amber-400">
              -{formatMoney(safeToSpend.unpaidReservedCommitmentsMinor, profile.preferredCurrency, profile.locale)}
            </span>
          </div>

          <div className="flex justify-between py-1.5">
            <span className="text-slate-400">- Épargne sanctuarisée</span>
            <span className="font-mono-numbers font-medium text-blue-400">
              -{formatMoney(safeToSpend.plannedSavingsMinor, profile.preferredCurrency, profile.locale)}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Tracked Accounts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Comptes suivis ({accounts.length})
          </h3>
          <button
            onClick={() => onNavigate('settings')}
            className="text-xs text-slate-400 hover:text-slate-200 min-h-[44px] flex items-center"
          >
            Gérer
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((acc) => {
            const bal = calculateAccountBalance(acc, transactions);
            return (
              <div
                key={acc.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">{acc.name}</span>
                    <span className="text-[11px] text-slate-500 uppercase">{acc.type}</span>
                  </div>
                </div>
                <span className="text-sm font-bold font-mono-numbers text-slate-100">
                  {formatMoney(bal, acc.currency, profile.locale)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Upcoming Commitments (Bills) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Prochaines factures réservées
          </h3>
          <button
            onClick={() => onNavigate('plan')}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 min-h-[44px]"
          >
            <span>Voir tout</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {upcomingBills.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/30 border border-slate-800/60 p-4 text-center text-xs text-slate-500">
            Aucune facture en attente dans la période.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {upcomingBills.map((bill) => (
              <div key={bill.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-amber-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">{bill.name}</span>
                    <span className="text-[11px] text-slate-500">
                      Échéance: {bill.nextDueDate}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold font-mono-numbers text-amber-400">
                  {formatMoney(bill.amountMinor, bill.currency, profile.locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Savings Goals Progress */}
      {activeGoals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Objectifs d'épargne
            </h3>
            <button
              onClick={() => onNavigate('plan')}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 min-h-[44px]"
            >
              <span>Objectifs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {activeGoals.map((goal) => {
              const progressPct = Math.min(
                100,
                Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100)
              );
              return (
                <div
                  key={goal.id}
                  className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-blue-950/60 text-blue-400">
                        <PiggyBank className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-slate-200">{goal.name}</span>
                    </div>
                    <span className="text-xs font-mono-numbers text-slate-300">
                      {progressPct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-mono-numbers">
                    <span>{formatMoney(goal.currentAmountMinor, goal.currency, profile.locale)}</span>
                    <span>Cible: {formatMoney(goal.targetAmountMinor, goal.currency, profile.locale)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
