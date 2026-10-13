import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  PlusCircle,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  Phone,
  Store,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  PieChart,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  HeartPulse,
} from 'lucide-react';
import {
  DebtEntry,
  DebtType,
  Business,
  Account,
  SafeToSpendBreakdown,
  Category,
  Transaction,
  SavingsGoal,
  UserProfile,
} from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import {
  calculateDebtSummary,
  calculateFinancialHealthScore,
} from '../services/debtStore';
import { AddDebtModal } from './AddDebtModal';
import { SettleDebtModal } from './SettleDebtModal';

interface DebtLedgerViewProps {
  debts: DebtEntry[];
  businesses: Business[];
  accounts: Account[];
  safeToSpend: SafeToSpendBreakdown;
  categories: Category[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  profile: UserProfile;
  onAddDebt: (
    debtData: Omit<
      DebtEntry,
      'id' | 'remainingAmountMinor' | 'status' | 'payments' | 'createdAt' | 'updatedAt'
    >
  ) => void;
  onSettleDebt: (params: {
    debtId: string;
    amountMinor: number;
    paymentDate: string;
    sourceAccountId?: string;
    notes?: string;
    createLinkedTransaction: boolean;
  }) => void;
  onDeleteDebt: (id: string) => void;
  onOpenAIModal?: () => void;
}

export const DebtLedgerView: React.FC<DebtLedgerViewProps> = ({
  debts,
  businesses,
  accounts,
  safeToSpend,
  categories,
  transactions,
  savingsGoals,
  profile,
  onAddDebt,
  onSettleDebt,
  onDeleteDebt,
  onOpenAIModal,
}) => {
  const [activeTab, setActiveTab] = useState<'kredy' | 'health' | 'analytics'>('kredy');
  const [filterType, setFilterType] = useState<'all' | 'payable' | 'receivable' | 'settled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<DebtEntry | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  const summary = useMemo(() => calculateDebtSummary(debts), [debts]);

  const healthScore = useMemo(
    () =>
      calculateFinancialHealthScore({
        safeToSpend,
        accounts,
        transactions,
        savingsGoals,
        debts,
      }),
    [safeToSpend, accounts, transactions, savingsGoals, debts]
  );

  // Filter debts
  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (filterType === 'payable' && (d.type !== 'payable' || d.status === 'settled')) return false;
      if (filterType === 'receivable' && (d.type !== 'receivable' || d.status === 'settled')) return false;
      if (filterType === 'settled' && d.status !== 'settled') return false;
      if (filterType === 'all' && d.status === 'settled') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = d.counterpartyName.toLowerCase();
        const notes = (d.notes || '').toLowerCase();
        if (!name.includes(q) && !notes.includes(q)) return false;
      }
      return true;
    });
  }, [debts, filterType, searchQuery]);

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-100">
                Carnet Kredy & Santé Financière
              </h1>
              <p className="text-xs text-slate-400">
                Phase 5 · Gestion des ardoises commerçants, créances et diagnostic financier
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAIModal && (
            <button
              onClick={onOpenAIModal}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-600 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer min-h-[44px]"
            >
              <HeartPulse className="w-4 h-4 text-amber-400" />
              <span>Optimiseur Kredy IA</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-950/40 cursor-pointer min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Noter un Kredy</span>
          </button>
        </div>
      </div>

      {/* Segmented Tab Controls */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('kredy')}
          className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-xl transition min-h-[44px] cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'kredy'
              ? 'bg-slate-800 text-amber-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Carnet des Dettes ({summary.activeCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-xl transition min-h-[44px] cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'health'
              ? 'bg-slate-800 text-emerald-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Score de Santé ({healthScore.score}/100)</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-2.5 px-3 text-xs font-semibold rounded-xl transition min-h-[44px] cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'analytics'
              ? 'bg-slate-800 text-blue-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Analyses & Flux</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CARNET KREDY                                            */}
      {/* ============================================================== */}
      {activeTab === 'kredy' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 block flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                <span>Je dois (Ardoises)</span>
              </span>
              <div className="text-base sm:text-lg font-bold font-mono-numbers text-rose-300">
                {formatMoney(summary.totalPayableMinor, profile.preferredCurrency)}
              </div>
              <span className="text-[10px] text-slate-400">À rembourser</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 block flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>On me doit (Créances)</span>
              </span>
              <div className="text-base sm:text-lg font-bold font-mono-numbers text-emerald-300">
                {formatMoney(summary.totalReceivableMinor, profile.preferredCurrency)}
              </div>
              <span className="text-[10px] text-slate-400">À recouvrer</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 block">Solde Kredy Net</span>
              <div
                className={`text-base sm:text-lg font-bold font-mono-numbers ${
                  summary.netDebtMinor >= 0 ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {formatMoney(summary.netDebtMinor, profile.preferredCurrency)}
              </div>
              <span className="text-[10px] text-slate-400">
                {summary.netDebtMinor >= 0 ? 'Créances nettes' : 'Dettes nettes'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 block flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Échéances dépassées</span>
              </span>
              <div
                className={`text-base sm:text-lg font-bold font-mono-numbers ${
                  summary.overdueCount > 0 ? 'text-rose-400' : 'text-slate-100'
                }`}
              >
                {summary.overdueCount}
              </div>
              <span className="text-[10px] text-slate-400">À régulariser</span>
            </div>
          </div>

          {/* Filter Pills & Search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un commerçant, personne ou note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 min-h-[44px]"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {(
                [
                  { id: 'all', label: 'En cours' },
                  { id: 'payable', label: 'Je dois' },
                  { id: 'receivable', label: 'On me doit' },
                  { id: 'settled', label: 'Soldés' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer min-h-[44px] ${
                    filterType === tab.id
                      ? 'bg-amber-600 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Debts List */}
          {filteredDebts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">Aucune dette dans cette vue</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Ajoutez vos ardoises commerçants ou créances pour suivre vos remboursements avec précision.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Noter un Kredy maintenant</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDebts.map((debt) => {
                const isPayable = debt.type === 'payable';
                const isOverdue =
                  debt.dueDate && debt.dueDate < todayStr && debt.remainingAmountMinor > 0;
                const paidPercentage = Math.round(
                  ((debt.totalAmountMinor - debt.remainingAmountMinor) / debt.totalAmountMinor) * 100
                );
                const isExpanded = expandedDebtId === debt.id;

                return (
                  <div
                    key={debt.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-3"
                  >
                    {/* Header: Name, Type Badge, Amounts */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-100 text-sm">
                            {debt.counterpartyName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPayable
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {isPayable ? 'Je dois' : 'On me doit'}
                          </span>

                          {debt.businessId && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 border border-amber-800/60">
                              <Store className="w-3 h-3" />
                              <span>Commerce de quartier</span>
                            </span>
                          )}

                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Échéance dépassée</span>
                            </span>
                          )}
                        </div>

                        {debt.notes && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {debt.notes}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-base font-bold font-mono-numbers ${
                            isPayable ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {formatMoney(debt.remainingAmountMinor, debt.currency)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Initial : {formatMoney(debt.totalAmountMinor, debt.currency)}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Remboursé : {paidPercentage}%</span>
                        {debt.dueDate && (
                          <span className={isOverdue ? 'text-rose-400 font-semibold' : ''}>
                            Échéance : {debt.dueDate}
                          </span>
                        )}
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            debt.status === 'settled'
                              ? 'bg-emerald-500'
                              : isPayable
                              ? 'bg-rose-500'
                              : 'bg-emerald-400'
                          }`}
                          style={{ width: `${paidPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-2">
                        {debt.counterpartyPhone && (
                          <a
                            href={`tel:${debt.counterpartyPhone}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 transition min-h-[36px]"
                            title="Appeler le commerçant"
                          >
                            <Phone className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden sm:inline">Appeler</span>
                          </a>
                        )}

                        {debt.payments.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDebtId(isExpanded ? null : debt.id)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs border border-slate-800 transition min-h-[36px] cursor-pointer"
                          >
                            <span>{debt.payments.length} versement(s)</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDeleteDebt(debt.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Supprimer cette ligne"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {debt.remainingAmountMinor > 0 && (
                          <button
                            type="button"
                            onClick={() => setSettlingDebt(debt)}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer min-h-[36px]"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{isPayable ? 'Régulariser' : 'Encaisser'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Accordion: Payments History */}
                    {isExpanded && debt.payments.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 block">
                          Historique des versements :
                        </span>
                        {debt.payments.map((pmt) => (
                          <div
                            key={pmt.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-950 text-xs text-slate-300 border border-slate-800/50"
                          >
                            <div className="space-y-0.5">
                              <span className="text-slate-400 text-[10px]">{pmt.paymentDate}</span>
                              {pmt.notes && <p className="text-[11px] text-slate-300">{pmt.notes}</p>}
                            </div>
                            <span className="font-mono-numbers font-bold text-emerald-300">
                              +{formatMoney(pmt.amountMinor, debt.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: SCORE DE SANTÉ FINANCIÈRE                               */}
      {/* ============================================================== */}
      {activeTab === 'health' && (
        <div className="space-y-5">
          {/* Main Score Hero Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {/* Grade Circle */}
                <div
                  className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-2xl shadow-xl shrink-0 ${
                    healthScore.grade === 'A+' || healthScore.grade === 'A'
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                      : healthScore.grade === 'B'
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40'
                      : 'bg-rose-600/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  <span>{healthScore.grade}</span>
                  <span className="text-[10px] font-mono-numbers opacity-80">
                    {healthScore.score}/100
                  </span>
                </div>

                <div className="space-y-1 text-center sm:text-left">
                  <h2 className="text-lg font-bold text-slate-100">
                    {healthScore.grade === 'A+' || healthScore.grade === 'A'
                      ? 'Santé Financière Excellente'
                      : healthScore.grade === 'B'
                      ? 'Santé Financière Équilibrée'
                      : 'Attention Recommandée'}
                  </h2>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Évaluation déterministe basée sur vos liquidités disponibles, votre reste à vivre
                    Safe-To-Spend et l’encours de vos dettes quartier.
                  </p>
                </div>
              </div>

              {/* Quick Health Ratios */}
              <div className="grid grid-cols-3 gap-3 w-full sm:w-auto">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Endettement</span>
                  <span className="font-mono-numbers font-bold text-xs text-slate-100">
                    {healthScore.debtToIncomeRatio}%
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Taux Épargne</span>
                  <span className="font-mono-numbers font-bold text-xs text-slate-100">
                    {healthScore.savingsRate}%
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] text-slate-400 block">Autonomie</span>
                  <span className="font-mono-numbers font-bold text-xs text-slate-100">
                    {healthScore.safeToSpendRunwayDays}j
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Diagnostic Factors List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Diagnostic Déterministe & Facteurs Clés
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {healthScore.factors.map((factor) => (
                <div
                  key={factor.id}
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {factor.impact === 'positive' && (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {factor.impact === 'neutral' && (
                      <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                    )}
                    {factor.impact === 'warning' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {factor.impact === 'critical' && (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-200">{factor.title}</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed pl-6">
                    {factor.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ANALYSES ET FLUX FINANCIERS                             */}
      {/* ============================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* Balance breakdown card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-amber-400" />
              <span>Consolidation de Trésorerie & Engagements</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Trésorerie Actuelle Brute</span>
                <span className="font-mono-numbers font-bold text-sm text-slate-100">
                  {formatMoney(safeToSpend.availableBalanceMinor, profile.preferredCurrency)}
                </span>
                <span className="text-[10px] text-slate-400 block">Comptes CCP + Espèces</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Factures & Dettes à Payer</span>
                <span className="font-mono-numbers font-bold text-sm text-rose-300">
                  {formatMoney(
                    safeToSpend.unpaidReservedCommitmentsMinor + summary.totalPayableMinor,
                    profile.preferredCurrency
                  )}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Factures ({formatMoney(safeToSpend.unpaidReservedCommitmentsMinor)}) + Kredy (
                  {formatMoney(summary.totalPayableMinor)})
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Reste à Vivre Net Garanti</span>
                <span
                  className={`font-mono-numbers font-bold text-sm ${
                    safeToSpend.safeToSpendMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatMoney(safeToSpend.safeToSpendMinor, profile.preferredCurrency)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {formatMoney(safeToSpend.dailyGuidelineMinor, profile.preferredCurrency)} / jour
                </span>
              </div>
            </div>
          </div>

          {/* Accounts Breakdown */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Répartition par compte de trésorerie
            </h3>
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="font-semibold text-slate-200">{acc.name}</span>
                    <span className="text-[10px] uppercase text-slate-400 font-mono">
                      ({acc.type})
                    </span>
                  </div>
                  <span className="font-mono-numbers font-bold text-slate-100">
                    {formatMoney(acc.initialBalanceMinor, acc.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Debt Modal */}
      <AddDebtModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        businesses={businesses}
        onSave={onAddDebt}
      />

      {/* Settle Debt Modal */}
      <SettleDebtModal
        isOpen={!!settlingDebt}
        onClose={() => setSettlingDebt(null)}
        debt={settlingDebt}
        accounts={accounts}
        onSettle={onSettleDebt}
      />
    </div>
  );
};
