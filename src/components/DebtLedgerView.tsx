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
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';
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
  onReconcilePayment: (params: { debtId: string; paymentId: string }) => Promise<void>;
  onResolvePaymentIssue: (params: { debtId: string; paymentId: string; action: 'duplicate' | 'refund'; refundAmountMinor?: number; duplicateOfPaymentId?: string }) => Promise<void>;
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
  onReconcilePayment,
  onResolvePaymentIssue,
  onOpenAIModal,
}) => {
  const [activeTab, setActiveTab] = useState<'kredy' | 'health' | 'analytics'>('kredy');
  const [filterType, setFilterType] = useState<'all' | 'payable' | 'receivable' | 'settled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<DebtEntry | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [reconciliationTarget, setReconciliationTarget] = useState<{ debtId: string; paymentId: string } | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [paymentIssueTarget, setPaymentIssueTarget] = useState<{ debtId: string; paymentId: string } | null>(null);
  const [paymentIssueAction, setPaymentIssueAction] = useState<'duplicate' | 'refund'>('refund');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [duplicateOriginalId, setDuplicateOriginalId] = useState('');
  const [isResolvingPaymentIssue, setIsResolvingPaymentIssue] = useState(false);
  const [paymentIssueError, setPaymentIssueError] = useState<string | null>(null);

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
  const reconciliationDebt = reconciliationTarget
    ? debts.find((debt) => debt.id === reconciliationTarget.debtId)
    : undefined;
  const reconciliationPayment = reconciliationDebt?.payments.find(
    (payment) => payment.id === reconciliationTarget?.paymentId
  );
  const reconciliationAmountMinor = reconciliationPayment?.unappliedAmountMinor || 0;
  const paymentIssueDebt = paymentIssueTarget ? debts.find((debt) => debt.id === paymentIssueTarget.debtId) : undefined;
  const paymentIssuePayment = paymentIssueDebt?.payments.find((payment) => payment.id === paymentIssueTarget?.paymentId);
  const duplicateCandidates = paymentIssueDebt?.payments.filter((payment) =>
    payment.id !== paymentIssueTarget?.paymentId && (payment.resolutionStatus || 'normal') !== 'duplicate' &&
    !paymentIssueDebt.payments.some((item) => item.duplicateOfPaymentId === payment.id)
  ) || [];
  const refundableAmountMinor = paymentIssuePayment
    ? paymentIssuePayment.amountMinor - (paymentIssuePayment.refundedAmountMinor || 0)
    : 0;

  const confirmPaymentIssue = async () => {
    if (!paymentIssueTarget || !paymentIssuePayment) return;
    const refundAmountMinor = parseToMinorUnits(refundAmountInput);
    if (paymentIssueAction === 'refund' && (!Number.isSafeInteger(refundAmountMinor) || refundAmountMinor <= 0 || refundAmountMinor > refundableAmountMinor)) {
      setPaymentIssueError('Saisissez un montant de remboursement valide.');
      return;
    }
    if (paymentIssueAction === 'duplicate' && !duplicateOriginalId) {
      setPaymentIssueError('Sélectionnez le versement original.');
      return;
    }
    setIsResolvingPaymentIssue(true);
    setPaymentIssueError(null);
    try {
      await onResolvePaymentIssue({
        ...paymentIssueTarget,
        action: paymentIssueAction,
        refundAmountMinor: paymentIssueAction === 'refund' ? refundAmountMinor : undefined,
        duplicateOfPaymentId: paymentIssueAction === 'duplicate' ? duplicateOriginalId : undefined,
      });
      setPaymentIssueTarget(null);
      setRefundAmountInput('');
      setDuplicateOriginalId('');
    } catch (error) {
      setPaymentIssueError(error instanceof Error ? error.message : 'Impossible de traiter ce versement');
    } finally {
      setIsResolvingPaymentIssue(false);
    }
  };

  const confirmReconciliation = async () => {
    if (!reconciliationTarget || reconciliationAmountMinor <= 0) return;
    setIsReconciling(true);
    setReconciliationError(null);
    try {
      await onReconcilePayment(reconciliationTarget);
      setReconciliationTarget(null);
    } catch (error) {
      setReconciliationError(error instanceof Error ? error.message : 'Unable to reconcile this payment');
    } finally {
      setIsReconciling(false);
    }
  };

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
                const unappliedAmountMinor = debt.payments.reduce(
                  (sum, payment) => sum + (payment.unappliedAmountMinor || 0),
                  0
                );

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

                    {unappliedAmountMinor > 0 && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-200">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold">Versements à rapprocher</p>
                          <p className="text-[11px] leading-relaxed text-amber-100/90">
                            {formatMoney(unappliedAmountMinor, debt.currency)} n'a pas été affecté à cette dette.
                            Vérifiez les versements sur vos appareils avant de corriger le montant.
                          </p>
                        </div>
                      </div>
                    )}

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
                              <p className="text-[11px] text-slate-300">
                                Affecté : {formatMoney(pmt.appliedAmountMinor ?? pmt.amountMinor, debt.currency)}
                              </p>
                              {(pmt.unappliedAmountMinor || 0) > 0 && (
                                <p className="text-[11px] font-semibold text-amber-300">
                                  À rapprocher : {formatMoney(pmt.unappliedAmountMinor || 0, debt.currency)}
                                </p>
                              )}
                              {pmt.resolutionStatus === 'duplicate' && (
                                <p className="text-[11px] font-semibold text-slate-500">Doublon confirmé · exclu du calcul</p>
                              )}
                              {(pmt.refundedAmountMinor || 0) > 0 && (
                                <p className="text-[11px] font-semibold text-sky-300">
                                  {pmt.resolutionStatus === 'refunded' ? 'Remboursé' : 'Remboursé partiellement'} : {formatMoney(pmt.refundedAmountMinor || 0, debt.currency)}
                                </p>
                              )}
                              {pmt.notes && <p className="text-[11px] text-slate-300">{pmt.notes}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              <span className="font-mono-numbers font-bold text-emerald-300">
                                +{formatMoney(pmt.amountMinor, debt.currency)}
                              </span>
                              {(pmt.unappliedAmountMinor || 0) > 0 && (pmt.resolutionStatus || 'normal') === 'normal' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReconciliationError(null);
                                    setReconciliationTarget({ debtId: debt.id, paymentId: pmt.id });
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-amber-700/70 bg-amber-950/40 text-amber-200 text-[10px] font-semibold hover:bg-amber-900/50 transition cursor-pointer min-h-[34px]"
                                >
                                  Examiner le reliquat
                                </button>
                              )}
                              {['normal', 'partially_refunded'].includes(pmt.resolutionStatus || 'normal') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentIssueError(null);
                                    setPaymentIssueTarget({ debtId: debt.id, paymentId: pmt.id });
                                    setRefundAmountInput('');
                                    setDuplicateOriginalId('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-sky-800/70 bg-sky-950/30 text-sky-200 text-[10px] font-semibold hover:bg-sky-900/40 transition cursor-pointer min-h-[34px]"
                                >
                                  Doublon / remboursement
                                </button>
                              )}
                            </div>
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
        userId={profile.id}
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

      {reconciliationTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kredy-reconciliation-title"
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-amber-800/70 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-300">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="kredy-reconciliation-title" className="text-base font-bold text-slate-100">
                  Rapprocher le versement
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {reconciliationDebt?.counterpartyName || 'Dette Kredy'}
                </p>
              </div>
            </div>

            {reconciliationDebt && reconciliationPayment && reconciliationAmountMinor > 0 ? (
              <>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <p className="text-[11px] text-slate-400">Montant non affecté de ce versement</p>
                  <p className="text-xl font-bold font-mono-numbers text-amber-200">
                    {formatMoney(reconciliationAmountMinor, reconciliationDebt.currency)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Date du versement : {reconciliationPayment.paymentDate}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  Confirmez uniquement si le montant initial de cette dette avait été saisi trop bas.
                  Cette action augmente le montant initial de la dette du reliquat affiché, puis recalcule
                  les versements côté serveur pour tous vos appareils. Le versement original reste intact.
                </p>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  Si le versement est un doublon, a été remboursé ou ne concerne pas cette dette, annulez
                  et laissez-le en attente. Ne confirmez pas cet ajustement dans ces cas.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-300">
                Ce versement n’a plus de montant à rapprocher. Fermez cette fenêtre et actualisez le carnet Kredy.
              </p>
            )}

            {reconciliationError && (
              <p role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
                {reconciliationError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReconciliationTarget(null)}
                disabled={isReconciling}
                className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmReconciliation()}
                disabled={isReconciling || reconciliationAmountMinor <= 0}
                className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold disabled:opacity-50 cursor-pointer min-h-[44px]"
              >
                {isReconciling ? 'Synchronisation…' : 'Confirmer l’ajustement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentIssueTarget && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="kredy-payment-issue-title" className="w-full max-w-md rounded-2xl bg-slate-900 border border-sky-800/70 shadow-2xl p-5 space-y-4">
            <div>
              <h2 id="kredy-payment-issue-title" className="text-base font-bold text-slate-100">Traiter un doublon ou un remboursement</h2>
              <p className="text-xs text-slate-400 mt-1">{paymentIssueDebt?.counterpartyName} · {paymentIssuePayment?.paymentDate}</p>
              <p className="text-sm font-bold text-slate-100 mt-2">Versement initial : {paymentIssueDebt && paymentIssuePayment ? formatMoney(paymentIssuePayment.amountMinor, paymentIssueDebt.currency) : '—'}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setPaymentIssueAction('refund'); setPaymentIssueError(null); }} className={`min-h-[42px] rounded-xl text-xs font-semibold border ${paymentIssueAction === 'refund' ? 'bg-sky-900/50 border-sky-500 text-sky-100' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>Remboursement</button>
              <button type="button" disabled={paymentIssuePayment?.resolutionStatus === 'partially_refunded'} onClick={() => { setPaymentIssueAction('duplicate'); setPaymentIssueError(null); }} className={`min-h-[42px] rounded-xl text-xs font-semibold border ${paymentIssueAction === 'duplicate' ? 'bg-sky-900/50 border-sky-500 text-sky-100' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>Doublon</button>
            </div>

            {paymentIssueAction === 'refund' ? (
              <div className="space-y-2">
                <label htmlFor="kredy-refund-amount" className="block text-xs text-slate-300">Montant réellement remboursé ({paymentIssueDebt?.currency || 'DZD'})</label>
                <input id="kredy-refund-amount" type="text" inputMode="decimal" value={refundAmountInput} onChange={(event) => setRefundAmountInput(event.target.value)} className="w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-sm text-slate-100" placeholder={(refundableAmountMinor / 100).toFixed(2).replace(/\.00$/, '')} />
                <p className="text-[11px] text-slate-400">Reste remboursable : {paymentIssueDebt ? formatMoney(refundableAmountMinor, paymentIssueDebt.currency) : '—'}. Le remboursement augmente à nouveau le solde dû. Vous pouvez enregistrer plusieurs remboursements partiels.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="kredy-duplicate-original" className="block text-xs text-slate-300">Versement original correspondant</label>
                <select id="kredy-duplicate-original" value={duplicateOriginalId} onChange={(event) => setDuplicateOriginalId(event.target.value)} className="w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-xs text-slate-100">
                  <option value="">Choisir le versement original</option>
                  {duplicateCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.paymentDate} · {formatMoney(candidate.amountMinor, paymentIssueDebt?.currency)} · {candidate.id.slice(0, 8)}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">Le versement marqué comme doublon sera conservé dans l'historique, mais exclu du calcul. Il ne sera pas supprimé.</p>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-amber-200/90">Vérifiez vos relevés avant confirmation. Cette action est enregistrée et synchronisée sur vos appareils.</p>
            {paymentIssueError && <p role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-xs text-rose-200">{paymentIssueError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentIssueTarget(null)} disabled={isResolvingPaymentIssue} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold disabled:opacity-50">Annuler</button>
              <button type="button" onClick={() => void confirmPaymentIssue()} disabled={isResolvingPaymentIssue || (paymentIssueAction === 'duplicate' && duplicateCandidates.length === 0)} className="flex-1 h-11 rounded-xl bg-sky-600 hover:bg-sky-500 text-slate-950 text-xs font-bold disabled:opacity-50">{isResolvingPaymentIssue ? 'Synchronisation…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
