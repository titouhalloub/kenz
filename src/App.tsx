/**
 * Kenz Finance & Neighborhood Services — Mobile-First PWA
 */

import React, { useState, useMemo } from 'react';
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
import { loadAICreditWallet } from './services/aiCreditStore';
import {
  loadDebtState,
  addDebtEntry,
  recordDebtPayment,
  deleteDebtEntry,
} from './services/debtStore';
import {
  loadZakatState,
  saveZakatState,
  loadFestiveState,
  saveFestiveState,
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
import { User as UserIcon } from 'lucide-react';

type NavTab = 'home' | 'transactions' | 'plan' | 'nearby' | 'debts' | 'zakat' | 'settings' | 'profile';

export default function App() {
  const [budgetState, setBudgetState] = useState<BudgetState>(() => loadBudgetState());
  const [directoryState, setDirectoryState] = useState<DirectoryState>(() => loadDirectoryState());
  const [debts, setDebts] = useState<DebtEntry[]>(() => loadDebtState());
  const [zakatState, setZakatState] = useState<ZakatState>(() => loadZakatState());
  const [festiveBudgets, setFestiveBudgets] = useState<FestiveBudget[]>(() => loadFestiveState());
  const [aiWallet, setAiWallet] = useState<AICreditWallet>(() => loadAICreditWallet());
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => loadCurrentUser());
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState(false);
  const [kredyPreselectedBiz, setKredyPreselectedBiz] = useState<Business | null>(null);

  const handleUpdateZakat = (state: ZakatState) => {
    setZakatState(state);
    saveZakatState(state);
  };

  const handleUpdateFestiveBudgets = (budgets: FestiveBudget[]) => {
    setFestiveBudgets(budgets);
    saveFestiveState(budgets);
  };

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
        categoryId: isPayable ? 'cat-groceries' : 'cat-salary',
      });
      setBudgetState(updatedBudget);
    }
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
        }}
      />
    </div>
  );
}
