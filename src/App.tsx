/**
 * Kenz Finance & Neighborhood Services — Mobile-First PWA
 */

import React, { useState, useMemo, useEffect } from 'react';
import { translateKenzDOM } from './domain/i18n';
import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  Store,
  Settings as SettingsIcon,
  Plus,
  Grid3X3,
  Sparkles,
  BookOpen,
  Moon,
  BarChart3,
  MessageCircle,
  Radio,
} from 'lucide-react';
import {
  loadBudgetState,
  loadBudgetStateFromSupabase,
  saveBudgetState,
  flushPendingBudgetSync,
  addTransaction,
  deleteTransaction,
  addAccount,
  addRecurringItem,
  deleteRecurringItem,
  updateRecurringItem,
  recordRecurringPayment,
  addSavingsGoal,
  updateSavingsGoal,
  updateBudget,
  updateProfile,
  exportTransactionsToCSV,
  wipeAllLocalData,
  BudgetState,
} from './services/budgetStore';
import {
  loadDirectoryState,
  submitBusiness,
  reviewBusiness,
  reportBusiness,
  resolveReport,
  DirectoryState,
} from './services/directoryStore';
import { loadAICreditWallet, loadAICreditStateFromSupabase } from './services/aiCreditStore';
import {
  loadDebtState,
  loadDebtStateFromSupabase,
  saveDebtState,
  flushPendingDebtSync,
  addDebtEntry,
  recordDebtPayment,
  resolveUnappliedDebtPayment,
  resolveKredyPaymentIssue,
  deleteDebtEntry,
} from './services/debtStore';
import {
  loadZakatState,
  saveZakatState,
  loadZakatStateFromSupabase,
  loadFestiveState,
  saveFestiveState,
  loadFestiveStateFromSupabase,
  flushPendingZakatFestiveSync,
  ZakatState,
  FestiveBudget,
} from './services/zakatFestiveStore';
import { AICreditWallet, DebtEntry, Business, SavingsChallengeContribution } from './domain/types';
import {
  loadSavingsChallengeContributions,
  loadSavingsChallengeContributionsFromSupabase,
  addSavingsChallengeContribution,
  flushPendingSavingsChallengeContributions,
  retrySavingsChallengeSync,
} from './services/savingsChallengeStore';
import { calculateSafeToSpend } from './domain/financialCalculations';
import { HomeView } from './components/HomeView';
import { AdvancedReportsView } from './components/AdvancedReportsView';
import { TransactionsView } from './components/TransactionsView';
import { PlanView } from './components/PlanView';
import { DirectoryView } from './components/DirectoryView';
import { CommunityView } from './components/CommunityView';
import { ChannelsView } from './components/ChannelsView';
import { SettingsView } from './components/SettingsView';
import { DebtLedgerView } from './components/DebtLedgerView';
import { FestiveZakatView } from './components/FestiveZakatView';
import { AddTransactionModal } from './components/AddTransactionModal';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { AddDebtModal } from './components/AddDebtModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { AuthModal } from './components/AuthModal';
import { ProfileView } from './components/ProfileView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { loadCurrentUser, logoutUser, UserProfile } from './services/authStore';
import { getSupabaseClient } from './services/supabase';
import { dispatchBillReminders } from './services/billReminderService';
import { User as UserIcon } from 'lucide-react';
import { kenzText } from './domain/i18n';

type NavTab = 'home' | 'transactions' | 'reports' | 'plan' | 'nearby' | 'community' | 'channels' | 'debts' | 'zakat' | 'settings' | 'profile';

export default function App() {
  const [budgetState, setBudgetState] = useState<BudgetState>(() => loadBudgetState());
  const [directoryState, setDirectoryState] = useState<DirectoryState>(() => loadDirectoryState());
  const [debts, setDebts] = useState<DebtEntry[]>(() => loadDebtState());
  const [zakatState, setZakatState] = useState<ZakatState>(() => loadZakatState(loadCurrentUser().id));
  const [festiveBudgets, setFestiveBudgets] = useState<FestiveBudget[]>(() => loadFestiveState(loadCurrentUser().id));
  const [aiWallet, setAiWallet] = useState<AICreditWallet>(() => loadAICreditWallet());
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => loadCurrentUser());
  const [challengeContributions, setChallengeContributions] = useState<SavingsChallengeContribution[]>(() => loadSavingsChallengeContributions(loadCurrentUser().id));
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState(false);
  const [kredyPreselectedBiz, setKredyPreselectedBiz] = useState<Business | null>(null);

  // Restore an existing Supabase session and hydrate only that user's cloud data.
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) return () => { active = false; };

    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active || error || !data.user) return;
      const authUser = data.user;
      const authProfile: UserProfile = {
        id: authUser.id,
        email: authUser.email || '',
        fullName: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Kenz',
        country: authUser.user_metadata?.country || 'Algérie (DZ)',
        wilaya: authUser.user_metadata?.wilaya || '16 - Alger',
        membershipTier: authUser.user_metadata?.tier || 'Citoyen Free',
        createdAt: authUser.created_at,
      };
      setCurrentUser(authProfile);
      setDebts([]);
      setAiWallet({ userId: authUser.id, balanceCredits: 0, lifetimeCreditsUsed: 0, updatedAt: new Date().toISOString() });
      const financialProfile = {
        id: authUser.id,
        email: authUser.email || '',
        displayName: authProfile.fullName,
        preferredCurrency: budgetState.profile.preferredCurrency,
        locale: budgetState.profile.locale,
        paydayDayOfMonth: budgetState.profile.paydayDayOfMonth,
        planningPeriodDays: budgetState.profile.planningPeriodDays,
      };
      // Restore this account's own local cache before cloud access.
      setBudgetState(loadBudgetState(financialProfile));
      // Replay this user's durable local outbox before cloud hydration so offline edits aren't overwritten.
      await flushPendingBudgetSync(authUser.id);
      await flushPendingDebtSync(authUser.id);
      await flushPendingZakatFestiveSync(authUser.id);
      const [cloudState, cloudDebts, cloudCredits, cloudZakat, cloudFestive] = await Promise.all([
        loadBudgetStateFromSupabase(financialProfile),
        loadDebtStateFromSupabase(authUser.id),
        loadAICreditStateFromSupabase(authUser.id),
        loadZakatStateFromSupabase(authUser.id),
        loadFestiveStateFromSupabase(authUser.id),
      ]);
      if (!active) return;
      if (cloudState) setBudgetState(cloudState);
      setDebts(cloudDebts ?? loadDebtState(authUser.id));
      setAiWallet(cloudCredits?.wallet ?? { userId: authUser.id, balanceCredits: 0, lifetimeCreditsUsed: 0, updatedAt: new Date().toISOString() });
      setZakatState(cloudZakat ?? loadZakatState(authUser.id));
      setFestiveBudgets(cloudFestive ?? loadFestiveState(authUser.id));
    }).catch((error) => console.error('Unable to restore Kenz cloud session:', error));

    return () => { active = false; };
  }, []);

  // Load and replay the append-only savings challenge ledger for this account.
  useEffect(() => {
    let active = true;
    const userId = currentUser.id;
    setChallengeContributions(loadSavingsChallengeContributions(userId));
    void flushPendingSavingsChallengeContributions(userId)
      .then(() => loadSavingsChallengeContributionsFromSupabase(userId))
      .then((rows) => { if (active && rows) setChallengeContributions(rows); })
      .catch((error) => console.error('Unable to restore savings challenge contributions:', error));
    return () => { active = false; };
  }, [currentUser.id]);

  // Deliver due bill notifications while the app is active or returns to the foreground.
  useEffect(() => {
    const notify = () => dispatchBillReminders(currentUser.id, budgetState.recurringItems);
    notify();
    const onVisibility = () => { if (document.visibilityState === 'visible') notify(); };
    window.addEventListener('focus', notify);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(notify, 15 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', notify);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [currentUser.id, budgetState.recurringItems]);

  // Keep Kredy views fresh on other devices. Pending local outboxes are never replayed
  // from realtime callbacks, preventing sync-event loops and stale local overwrites.
  useEffect(() => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentUser.id)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`kredy-live-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'debts',
        filter: `user_id=eq.${currentUser.id}`,
      }, async () => {
        const latestDebts = await loadDebtStateFromSupabase(currentUser.id, false);
        if (latestDebts) setDebts(latestDebts);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'debt_sync_tombstones',
        filter: `user_id=eq.${currentUser.id}`,
      }, async () => {
        await flushPendingDebtSync(currentUser.id);
        const latestDebts = await loadDebtStateFromSupabase(currentUser.id);
        if (latestDebts) setDebts(latestDebts);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'debt_payments',
      }, async () => {
        await flushPendingDebtSync(currentUser.id);
        const latestDebts = await loadDebtStateFromSupabase(currentUser.id);
        if (latestDebts) setDebts(latestDebts);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  // Refresh all cloud-backed financial domains when another device commits a change.
  useEffect(() => {
    const userId = currentUser.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    let refreshQueue: Promise<void> = Promise.resolve();
    const refresh = () => {
      refreshQueue = refreshQueue.then(async () => {
        const [budget, zakat, festive, credits, contributions] = await Promise.all([
          loadBudgetStateFromSupabase({ ...budgetState.profile, id: userId }),
          loadZakatStateFromSupabase(userId),
          loadFestiveStateFromSupabase(userId),
          loadAICreditStateFromSupabase(userId),
          loadSavingsChallengeContributionsFromSupabase(userId),
        ]);
        if (!active) return;
        if (budget) setBudgetState(budget);
        if (zakat) setZakatState(zakat);
        if (festive) setFestiveBudgets(festive);
        if (credits?.wallet) setAiWallet(credits.wallet);
        if (contributions) setChallengeContributions(contributions);
      }).catch((error) => console.error('Kenz cross-device refresh failed:', error));
    };
    const channel = supabase.channel(`kenz-financial-live-${userId}`);
    const tables = [
      ['profiles', `id=eq.${userId}`],
      ['accounts', `user_id=eq.${userId}`],
      ['transactions', `user_id=eq.${userId}`],
      ['budgets', `user_id=eq.${userId}`],
      ['recurring_items', `user_id=eq.${userId}`],
      ['savings_goals', `user_id=eq.${userId}`],
      ['savings_challenge_contributions', `user_id=eq.${userId}`],
      ['zakat_settings', `user_id=eq.${userId}`],
      ['festive_budgets', `user_id=eq.${userId}`],
      ['ai_credit_wallets', `user_id=eq.${userId}`],
    ] as const;
    for (const [table, filter] of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, refresh);
    }
    channel.subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  const handleMarkRecurringPaid = (itemId: string) => {
    setBudgetState((current) => recordRecurringPayment(current, itemId));
  };

  const handleAddChallengeContribution = (goalId: string, amountMinor: number, date: string) => {
    setChallengeContributions(addSavingsChallengeContribution(currentUser.id, goalId, amountMinor, date));
    void flushPendingSavingsChallengeContributions(currentUser.id).then(async () => {
      const [contributions, latestBudget] = await Promise.all([
        loadSavingsChallengeContributionsFromSupabase(currentUser.id),
        loadBudgetStateFromSupabase({ ...budgetState.profile, id: currentUser.id }),
      ]);
      if (contributions) setChallengeContributions(contributions);
      if (latestBudget) setBudgetState(latestBudget);
    });
  };

  const handleUpdateZakat = (state: ZakatState) => {
    setZakatState(state);
    saveZakatState(state, currentUser.id);
  };

  const handleUpdateFestiveBudgets = (budgets: FestiveBudget[]) => {
    setFestiveBudgets(budgets);
    saveFestiveState(budgets, currentUser.id);
  };

  // Replay durable per-user outboxes when connectivity returns while the app remains open.
  useEffect(() => {
    if (typeof window === 'undefined' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentUser.id)) return;
    const retryCloudWrites = () => {
      void flushPendingBudgetSync(currentUser.id);
      saveBudgetState(budgetState);
      saveDebtState(debts, currentUser.id);
      saveZakatState(zakatState, currentUser.id);
      saveFestiveState(festiveBudgets, currentUser.id);
      retrySavingsChallengeSync(currentUser.id);
    };
    window.addEventListener('online', retryCloudWrites);
    return () => window.removeEventListener('online', retryCloudWrites);
  }, [currentUser.id, budgetState, debts, zakatState, festiveBudgets]);

  // Recalculate Safe-To-Spend deterministically
  const safeToSpend = useMemo(() => {
    return calculateSafeToSpend({
      accounts: budgetState.accounts,
      transactions: budgetState.transactions,
      recurringItems: budgetState.recurringItems,
      savingsGoals: budgetState.savingsGoals,
      todayDate: new Date(),
      paydayDayOfMonth: budgetState.profile.paydayDayOfMonth,
      planningPeriodDays: budgetState.profile.planningPeriodDays,
    });
  }, [
    budgetState.accounts,
    budgetState.transactions,
    budgetState.recurringItems,
    budgetState.savingsGoals,
    budgetState.profile.paydayDayOfMonth,
    budgetState.profile.planningPeriodDays,
  ]);

  // Handle CSV export
  const handleExportCSV = () => {
    const csvContent = exportTransactionsToCSV(budgetState);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kenz-transactions-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle data wipe
  const handleWipeData = () => {
    wipeAllLocalData();
    setBudgetState(loadBudgetState());
    setActiveTab('home');
  };

  // Phase 5: Handle debt events
  const handleAddDebt = (
    debtData: Omit<
      DebtEntry,
      'id' | 'remainingAmountMinor' | 'status' | 'payments' | 'createdAt' | 'updatedAt'
    >
  ) => {
    setDebts((prev) => addDebtEntry(prev, debtData));
  };

  const handleSettleDebt = (params: {
    debtId: string;
    amountMinor: number;
    paymentDate: string;
    sourceAccountId?: string;
    notes?: string;
    createLinkedTransaction: boolean;
  }) => {
    const targetDebt = debts.find((d) => d.id === params.debtId);
    const { nextDebts } = recordDebtPayment(debts, params);
    setDebts(nextDebts);

    if (params.createLinkedTransaction && targetDebt && params.sourceAccountId) {
      const isPayable = targetDebt.type === 'payable';
      const updatedBudget = addTransaction(budgetState, {
        userId: budgetState.profile.id,
        accountId: params.sourceAccountId,
        type: isPayable ? 'expense' : 'income',
        amountMinor: params.amountMinor,
        currency: targetDebt.currency || budgetState.profile.preferredCurrency,
        transactionDate: params.paymentDate,
        description: isPayable
          ? `Règlement Kredy · ${targetDebt.counterpartyName}`
          : `Recouvrement Kredy · ${targetDebt.counterpartyName}`,
        categoryId: isPayable ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000007',
      });
      setBudgetState(updatedBudget);
    }
  };

  const handleReconcileUnappliedPayment = async (params: { debtId: string; paymentId: string }) => {
    const latestDebts = await resolveUnappliedDebtPayment(
      debts,
      params.debtId,
      params.paymentId,
      currentUser.id
    );
    setDebts(latestDebts);
  };

  const handleResolveKredyPaymentIssue = async (params: { debtId: string; paymentId: string; action: 'duplicate' | 'refund'; refundAmountMinor?: number; duplicateOfPaymentId?: string }) => {
    const latestDebts = await resolveKredyPaymentIssue(
      debts,
      params.debtId,
      params.paymentId,
      currentUser.id,
      params.action,
      params.refundAmountMinor,
      params.duplicateOfPaymentId
    );
    setDebts(latestDebts);
  };

  const handleDeleteDebt = (id: string) => {
    setDebts((prev) => deleteDebtEntry(prev, id));
  };

  const isRTL = budgetState.profile.locale === 'ar';
  useEffect(() => { document.documentElement.lang = budgetState.profile.locale; document.documentElement.dir = isRTL ? 'rtl' : 'ltr'; }, [budgetState.profile.locale, isRTL]);
  useEffect(() => {
    const applyTranslations = () => translateKenzDOM(document.body, budgetState.profile.locale);
    applyTranslations();
    const observer = new MutationObserver(() => applyTranslations());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    return () => observer.disconnect();
  }, [budgetState.profile.locale]);

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-white"
    >
      <OfflineIndicator />

      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (Nav links) — Zone 3 (Action) */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('home')}
            className="text-base sm:text-lg font-bold tracking-tight text-white hover:text-emerald-400 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-emerald-950">
              K
            </span>
            <span>Kenz Finance</span>
          </button>
        </div>

        {/* Zone 2: Navigation Links (Desktop/Tablet) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-400">
          <button
            onClick={() => setActiveTab('home')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'home' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'dashboard', 'Tableau de bord')}
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'transactions' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'transactions', 'Opérations')}
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'reports' ? 'text-violet-300 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {budgetState.profile.locale === 'ar' ? 'التقارير' : 'Rapports'}
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'plan' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'planning', 'Planification & Objectifs')}
          </button>
          <button
            onClick={() => setActiveTab('nearby')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'nearby' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'neighborhood', 'Quartier & Services')}
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'community' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {budgetState.profile.locale === 'ar' ? 'المجتمع' : budgetState.profile.locale === 'en' ? 'Community' : 'Communauté'}
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center gap-1 cursor-pointer ${
              activeTab === 'channels' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Radio className="h-4 w-4" /> {budgetState.profile.locale === 'ar' ? 'القنوات' : budgetState.profile.locale === 'en' ? 'Channels' : 'Chaînes'}
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'debts' ? 'text-amber-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'debts', 'Carnet Kredy')}
          </button>
          <button
            onClick={() => setActiveTab('zakat')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'zakat' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'zakat', 'Zakat & Fêtes')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'settings' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            {kenzText(budgetState.profile.locale, 'settings', 'Paramètres')}
          </button>
        </nav>

        {/* Zone 3: Actions (Coach IA + PWA Install + Profile + Add button) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAIModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-700/80 text-amber-300 font-semibold text-xs transition cursor-pointer min-h-[44px]"
            title="Assistant IA et solde de crédits"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">{kenzText(budgetState.profile.locale, 'aiCoach', 'Coach IA')}</span>
            <span className="font-mono-numbers text-[11px] bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 border border-slate-800">
              {aiWallet.balanceCredits} cr.
            </span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer min-h-[44px] ${
              activeTab === 'profile'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
            }`}
            title="Mon Profil & Compte"
          >
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4 text-emerald-400" />
            )}
            <span className="hidden md:inline">{currentUser.fullName.split(' ')[0]}</span>
          </button>

          <PWAInstallButton />
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>{kenzText(budgetState.profile.locale, 'addTransaction', 'Opération')}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Responsive container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-5">
        {activeTab === 'home' && (
          <HomeView
            profile={budgetState.profile}
            accounts={budgetState.accounts}
            transactions={budgetState.transactions}
            recurringItems={budgetState.recurringItems}
            savingsGoals={budgetState.savingsGoals}
            safeToSpend={safeToSpend}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenReceiptScanner={() => setIsReceiptScannerOpen(true)}
            onOpenAIModal={() => setIsAIModalOpen(true)}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            transactions={budgetState.transactions}
            accounts={budgetState.accounts}
            categories={budgetState.categories}
            profile={budgetState.profile}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenReceiptScanner={() => setIsReceiptScannerOpen(true)}
            onDeleteTransaction={(id) => setBudgetState(deleteTransaction(budgetState, id))}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'reports' && (
          <AdvancedReportsView
            transactions={budgetState.transactions}
            categories={budgetState.categories}
            profile={budgetState.profile}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'plan' && (
          <PlanView
            categories={budgetState.categories}
            budgets={budgetState.budgets}
            recurringItems={budgetState.recurringItems}
            accounts={budgetState.accounts}
            savingsGoals={budgetState.savingsGoals}
            transactions={budgetState.transactions}
            profile={budgetState.profile}
            onUpdateBudget={(catId, minor) =>
              setBudgetState(
                updateBudget(
                  budgetState,
                  catId,
                  `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-01`,
                  minor,
                  budgetState.profile.preferredCurrency
                )
              )
            }
            onAddRecurring={(data) => setBudgetState(addRecurringItem(budgetState, data))}
            onDeleteRecurring={(id) => setBudgetState(deleteRecurringItem(budgetState, id))}
            onMarkRecurringPaid={handleMarkRecurringPaid}
            onToggleRecurring={(id, isActive) => setBudgetState((current) => updateRecurringItem(current, id, { isActive }))}
            onUpdateRecurring={(id, updates) => setBudgetState((current) => updateRecurringItem(current, id, updates))}
            onAddSavingsGoal={(data) => setBudgetState(addSavingsGoal(budgetState, data))}
            onUpdateSavingsGoal={(id, updates) =>
              setBudgetState(updateSavingsGoal(budgetState, id, updates))
            }
            challengeContributions={challengeContributions}
            onAddChallengeContribution={handleAddChallengeContribution}
          />
        )}

        {activeTab === 'nearby' && (
          <DirectoryView
            businesses={directoryState.businesses}
            onSubmitBusiness={(bizData, docs) => {
              const { nextState } = submitBusiness(directoryState, bizData, docs);
              setDirectoryState(nextState);
            }}
            onSubmitReport={(bizId, reason, details) => {
              setDirectoryState(reportBusiness(directoryState, { businessId: bizId, reason, details }));
            }}
          />
        )}

        {activeTab === 'community' && (
          <CommunityView
            user={currentUser}
            locale={budgetState.profile.locale}
            availableBudgetMinor={safeToSpend.safeToSpendMinor}
          />
        )}

        {activeTab === 'channels' && (
          <ChannelsView user={currentUser} locale={budgetState.profile.locale} />
        )}

        {activeTab === 'debts' && (
          <DebtLedgerView
            debts={debts}
            businesses={directoryState.businesses}
            accounts={budgetState.accounts}
            safeToSpend={safeToSpend}
            categories={budgetState.categories}
            transactions={budgetState.transactions}
            savingsGoals={budgetState.savingsGoals}
            profile={budgetState.profile}
            onAddDebt={handleAddDebt}
            onSettleDebt={handleSettleDebt}
            onDeleteDebt={handleDeleteDebt}
            onReconcilePayment={handleReconcileUnappliedPayment}
            onResolvePaymentIssue={handleResolveKredyPaymentIssue}
            onOpenAIModal={() => setIsAIModalOpen(true)}
          />
        )}

        {activeTab === 'zakat' && (
          <FestiveZakatView
            zakatState={zakatState}
            onUpdateZakat={handleUpdateZakat}
            festiveBudgets={festiveBudgets}
            onUpdateFestiveBudgets={handleUpdateFestiveBudgets}
            profile={budgetState.profile}
            onOpenAIModal={() => setIsAIModalOpen(true)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            profile={budgetState.profile}
            accounts={budgetState.accounts}
            businesses={directoryState.businesses}
            documents={directoryState.documents}
            reports={directoryState.reports}
            onReviewBusiness={(params) => {
              setDirectoryState(reviewBusiness(directoryState, params));
            }}
            onResolveReport={(repId, status) => {
              setDirectoryState(resolveReport(directoryState, repId, status));
            }}
            onUpdateProfile={(updates) => setBudgetState(updateProfile(budgetState, updates))}
            onAddAccount={(data) => setBudgetState(addAccount(budgetState, data))}
            onExportCSV={handleExportCSV}
            onWipeData={handleWipeData}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            user={currentUser}
            onUpdateUser={(updated) => setCurrentUser(updated)}
            onLogout={() => {
              logoutUser();
              setIsAuthModalOpen(true);
            }}
          />
        )}
      </main>

      <nav aria-label="Navigation principale" className="kenz-mobile-nav md:hidden">
        <div className="kenz-mobile-nav-inner">
          <button type="button" onClick={() => {setActiveTab('home');setIsMoreMenuOpen(false);}} className={activeTab === 'home' ? 'kenz-nav-item active' : 'kenz-nav-item'}><LayoutDashboard /><span>{budgetState.profile.locale === 'en' ? 'Home' : budgetState.profile.locale === 'ar' ? 'الرئيسية' : 'Accueil'}</span></button>
          <button type="button" onClick={() => {setActiveTab('reports');setIsMoreMenuOpen(false);}} className={activeTab === 'reports' ? 'kenz-nav-item active' : 'kenz-nav-item'}><BarChart3 /><span>{kenzText(budgetState.profile.locale, 'reports', 'Rapports')}</span></button>
          <button type="button" onClick={() => {setActiveTab('plan');setIsMoreMenuOpen(false);}} className={activeTab === 'plan' ? 'kenz-nav-item active' : 'kenz-nav-item'}><CalendarDays /><span>{budgetState.profile.locale === 'en' ? 'Plan' : budgetState.profile.locale === 'ar' ? 'الخطة' : 'Budgets'}</span></button>
          <button type="button" aria-haspopup="dialog" aria-expanded={isMoreMenuOpen} onClick={() => setIsMoreMenuOpen(open => !open)} className={isMoreMenuOpen || !(['home','reports','plan'] as NavTab[]).includes(activeTab) ? 'kenz-nav-item active' : 'kenz-nav-item'}><Grid3X3 /><span>{budgetState.profile.locale === 'en' ? 'More' : budgetState.profile.locale === 'ar' ? 'المزيد' : 'Plus'}</span></button>
        </div>
      </nav>
      {isMoreMenuOpen && (
        <div className="kenz-more-overlay" role="presentation" onClick={() => setIsMoreMenuOpen(false)}>
          <section className="kenz-more-sheet" role="dialog" aria-modal="true" aria-label={budgetState.profile.locale === 'en' ? 'More destinations' : budgetState.profile.locale === 'ar' ? 'المزيد' : 'Plus de destinations'} onClick={event => event.stopPropagation()}>
            <div className="kenz-sheet-handle" />
            <div className="kenz-section-heading"><div><span className="kenz-card-kicker">KENZ</span><h2>{budgetState.profile.locale === 'en' ? 'Explore' : budgetState.profile.locale === 'ar' ? 'استكشف' : 'Explorer'}</h2></div><button type="button" aria-label="Fermer" onClick={() => setIsMoreMenuOpen(false)}>×</button></div>
            <div className="kenz-more-grid">
              {([
                ['transactions', budgetState.profile.locale === 'en' ? 'Transactions' : budgetState.profile.locale === 'ar' ? 'المعاملات' : 'Opérations', Receipt],
                ['nearby', budgetState.profile.locale === 'en' ? 'Nearby' : budgetState.profile.locale === 'ar' ? 'المتاجر القريبة' : 'À proximité', Store],
                ['community', budgetState.profile.locale === 'en' ? 'Community' : budgetState.profile.locale === 'ar' ? 'المجتمع' : 'Communauté', MessageCircle],
                ['channels', budgetState.profile.locale === 'en' ? 'Channels' : budgetState.profile.locale === 'ar' ? 'القنوات' : 'Chaînes', Radio],
                ['debts', 'Kredy', BookOpen], ['zakat', 'Zakat', Moon],
                ['settings', budgetState.profile.locale === 'en' ? 'Settings' : budgetState.profile.locale === 'ar' ? 'الإعدادات' : 'Paramètres', SettingsIcon],
                ['profile', budgetState.profile.locale === 'en' ? 'Profile' : budgetState.profile.locale === 'ar' ? 'الملف الشخصي' : 'Profil', Sparkles],
              ] as const).map(([tab,label,Icon]) => (
                <button type="button" key={tab} onClick={() => {setActiveTab(tab);setIsMoreMenuOpen(false);}} className={activeTab === tab ? 'kenz-more-item active' : 'kenz-more-item'}><span><Icon /></span><b>{label}</b></button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        accounts={budgetState.accounts}
        categories={budgetState.categories}
        recurringItems={budgetState.recurringItems}
        preferredCurrency={budgetState.profile.preferredCurrency}
        onSave={(txData) => {
          setBudgetState(addTransaction(budgetState, { ...txData, userId: budgetState.profile.id }));
        }}
      />

      <ReceiptScannerModal
        isOpen={isReceiptScannerOpen}
        onClose={() => setIsReceiptScannerOpen(false)}
        accounts={budgetState.accounts}
        categories={budgetState.categories}
        profile={budgetState.profile}
        availableCredits={aiWallet.balanceCredits}
        onCreditsUpdated={(balance) => setAiWallet((current) => ({ ...current, balanceCredits: balance, updatedAt: new Date().toISOString() }))}
        onSave={(txData) => setBudgetState(addTransaction(budgetState, { ...txData, userId: budgetState.profile.id }))}
      />

      {/* AI Assistant, Metering & Credits Modal */}
      <AIAssistantModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        wallet={aiWallet}
        profile={budgetState.profile}
        safeToSpend={safeToSpend}
        transactions={budgetState.transactions}
        recurringItems={budgetState.recurringItems}
        onWalletUpdated={() => setAiWallet(loadAICreditWallet())}
      />

      {/* Authentication & Profile Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(u) => {
          setCurrentUser(u);
          setActiveTab('profile');
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u.id)) {
            setDebts([]);
            setAiWallet({ userId: u.id, balanceCredits: 0, lifetimeCreditsUsed: 0, updatedAt: new Date().toISOString() });
          }
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u.id)) {
            const financialProfile = {
              id: u.id, email: u.email, displayName: u.fullName,
              preferredCurrency: budgetState.profile.preferredCurrency,
              locale: budgetState.profile.locale,
              paydayDayOfMonth: budgetState.profile.paydayDayOfMonth,
              planningPeriodDays: budgetState.profile.planningPeriodDays,
            };
            setBudgetState(loadBudgetState(financialProfile));
            void flushPendingBudgetSync(u.id).then(async () => {
              await flushPendingDebtSync(u.id);
              return Promise.all([
              loadBudgetStateFromSupabase(financialProfile),
              loadDebtStateFromSupabase(u.id),
              loadAICreditStateFromSupabase(u.id),
              loadZakatStateFromSupabase(u.id),
              loadFestiveStateFromSupabase(u.id),
              ]);
            }).then(([cloudState, cloudDebts, cloudCredits, cloudZakat, cloudFestive]) => {
              if (cloudState) setBudgetState(cloudState);
              setDebts(cloudDebts ?? loadDebtState(u.id));
              setAiWallet(cloudCredits?.wallet ?? { userId: u.id, balanceCredits: 0, lifetimeCreditsUsed: 0, updatedAt: new Date().toISOString() });
              setZakatState(cloudZakat ?? loadZakatState(u.id));
              setFestiveBudgets(cloudFestive ?? loadFestiveState(u.id));
            });
          }
        }}
      />
    </div>
  );
}
