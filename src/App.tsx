/**
 * Kenz Finance & Neighborhood Services — Mobile-First PWA
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  Store,
  Settings as SettingsIcon,
  Plus,
  Sparkles,
  BookOpen,
  Moon,
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
  ZakatState,
  FestiveBudget,
} from './services/zakatFestiveStore';
import { AICreditWallet, DebtEntry, Business } from './domain/types';
import { calculateSafeToSpend } from './domain/financialCalculations';
import { HomeView } from './components/HomeView';
import { TransactionsView } from './components/TransactionsView';
import { PlanView } from './components/PlanView';
import { DirectoryView } from './components/DirectoryView';
import { SettingsView } from './components/SettingsView';
import { DebtLedgerView } from './components/DebtLedgerView';
import { FestiveZakatView } from './components/FestiveZakatView';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddDebtModal } from './components/AddDebtModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { AuthModal } from './components/AuthModal';
import { ProfileView } from './components/ProfileView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { loadCurrentUser, logoutUser, UserProfile } from './services/authStore';
import { getSupabaseClient } from './services/supabase';
import { User as UserIcon } from 'lucide-react';

type NavTab = 'home' | 'transactions' | 'plan' | 'nearby' | 'debts' | 'zakat' | 'settings' | 'profile';

export default function App() {
  const [budgetState, setBudgetState] = useState<BudgetState>(() => loadBudgetState());
  const [directoryState, setDirectoryState] = useState<DirectoryState>(() => loadDirectoryState());
  const [debts, setDebts] = useState<DebtEntry[]>(() => loadDebtState());
  const [zakatState, setZakatState] = useState<ZakatState>(() => loadZakatState(loadCurrentUser().id));
  const [festiveBudgets, setFestiveBudgets] = useState<FestiveBudget[]>(() => loadFestiveState(loadCurrentUser().id));
  const [aiWallet, setAiWallet] = useState<AICreditWallet>(() => loadAICreditWallet());
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => loadCurrentUser());
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  // Keep Kredy views on other signed-in devices fresh. Each refresh first replays
  // this device's pending outbox, then hydrates the conflict-merged cloud snapshot.
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
        await flushPendingDebtSync(currentUser.id);
        const latestDebts = await loadDebtStateFromSupabase(currentUser.id);
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

  const handleUpdateZakat = (state: ZakatState) => {
    setZakatState(state);
    saveZakatState(state, currentUser.id);
  };

  const handleUpdateFestiveBudgets = (budgets: FestiveBudget[]) => {
    setFestiveBudgets(budgets);
    saveFestiveState(budgets, currentUser.id);
  };

  // Retry current in-memory financial writes when connectivity returns while
  // the app remains open. This is a best-effort retry, not a durable offline outbox.
  useEffect(() => {
    if (typeof window === 'undefined' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentUser.id)) return;
    const retryCloudWrites = () => {
      void flushPendingBudgetSync(currentUser.id);
      saveBudgetState(budgetState);
      saveDebtState(debts, currentUser.id);
      saveZakatState(zakatState, currentUser.id);
      saveFestiveState(festiveBudgets, currentUser.id);
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
            Tableau de bord
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'transactions' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Opérations
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'plan' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Planification & Objectifs
          </button>
          <button
            onClick={() => setActiveTab('nearby')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'nearby' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Quartier & Services
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'debts' ? 'text-amber-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Carnet Kredy
          </button>
          <button
            onClick={() => setActiveTab('zakat')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'zakat' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Zakat & Fêtes
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`whitespace-nowrap transition-colors min-h-[44px] flex items-center cursor-pointer ${
              activeTab === 'settings' ? 'text-emerald-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            Paramètres
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
            <span className="hidden sm:inline">Coach IA</span>
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
            <span>Opération</span>
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
            onDeleteTransaction={(id) => setBudgetState(deleteTransaction(budgetState, id))}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'plan' && (
          <PlanView
            categories={budgetState.categories}
            budgets={budgetState.budgets}
            recurringItems={budgetState.recurringItems}
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
            onAddSavingsGoal={(data) => setBudgetState(addSavingsGoal(budgetState, data))}
            onUpdateSavingsGoal={(id, updates) =>
              setBudgetState(updateSavingsGoal(budgetState, id, updates))
            }
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

      {/* Mobile Fixed Bottom Navigation Bar (7 destinations + Thumb Ergonomics) */}
      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-lg border-t border-slate-800/80 px-1 py-1"
      >
        <div className="grid grid-cols-7 items-center h-16 max-w-xl mx-auto">
          {/* 1. Home Tab */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'home' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Accueil</span>
          </button>

          {/* 2. Transactions Tab */}
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'transactions' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Opérations</span>
          </button>

          {/* 3. Nearby / Directory Tab */}
          <button
            onClick={() => setActiveTab('nearby')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'nearby' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Quartier</span>
          </button>

          {/* 4. Carnet Kredy Tab */}
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'debts' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Kredy</span>
          </button>

          {/* 5. Zakat & Fêtes Tab */}
          <button
            onClick={() => setActiveTab('zakat')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'zakat' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Zakat</span>
          </button>

          {/* 6. Plan Tab */}
          <button
            onClick={() => setActiveTab('plan')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'plan' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Plan</span>
          </button>

          {/* 7. Settings Tab */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
              activeTab === 'settings' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="text-[9px] mt-1 tracking-tight">Options</span>
          </button>
        </div>
      </nav>

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
