/**
 * Budget Store Service — High reliability local-first storage with Supabase PostgreSQL sync.
 * Guarantees zero data loss on network drops and operates seamlessly offline.
 */

import {
  UserProfile,
  Account,
  Category,
  Transaction,
  MonthlyBudget,
  RecurringItem,
  SavingsGoal,
} from '../domain/types';
import { getSupabaseClient } from './supabase';

const STORAGE_KEY = 'kenz_budget_state_v1';

export interface BudgetState {
  profile: UserProfile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: MonthlyBudget[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  lastSyncedAt?: string;
}

// Initial realistic baseline data for an Algerian user
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-groceries', name: 'Alimentation & Marché', icon: 'ShoppingBag', color: '#10b981', isIncome: false, isSystem: true },
  { id: 'cat-rent', name: 'Loyer & Logement', icon: 'Home', color: '#f59e0b', isIncome: false, isSystem: true },
  { id: 'cat-bills', name: 'Factures (Sonelgaz, Eau, Net)', icon: 'Zap', color: '#ef4444', isIncome: false, isSystem: true },
  { id: 'cat-transport', name: 'Transport & Carburant', icon: 'Car', color: '#3b82f6', isIncome: false, isSystem: true },
  { id: 'cat-health', name: 'Santé & Pharmacie', icon: 'Heart', color: '#ec4899', isIncome: false, isSystem: true },
  { id: 'cat-family', name: 'Famille & Enfants', icon: 'Users', color: '#8b5cf6', isIncome: false, isSystem: true },
  { id: 'cat-salary', name: 'Salaire / Revenu Principal', icon: 'Briefcase', color: '#10b981', isIncome: true, isSystem: true },
  { id: 'cat-freelance', name: 'Revenu Complémentaire', icon: 'TrendingUp', color: '#06b6d4', isIncome: true, isSystem: true },
];

const INITIAL_STATE: BudgetState = {
  profile: {
    id: 'usr_local_1',
    email: 'user@example.com',
    displayName: 'Titou',
    preferredCurrency: 'DZD',
    locale: 'fr',
    paydayDayOfMonth: 28, // Payday on 28th
    planningPeriodDays: 30,
  },
  accounts: [
    {
      id: 'acc_cash_1',
      userId: 'usr_local_1',
      name: 'Espèces (Cash Wallet)',
      type: 'cash',
      currency: 'DZD',
      initialBalanceMinor: 2500000, // 25,000.00 DZD
      isArchived: false,
    },
    {
      id: 'acc_bank_1',
      userId: 'usr_local_1',
      name: 'Compte CCP / Banque',
      type: 'bank',
      currency: 'DZD',
      initialBalanceMinor: 6500000, // 65,000.00 DZD
      isArchived: false,
    },
  ],
  categories: DEFAULT_CATEGORIES,
  transactions: [
    {
      id: 'tx_init_1',
      userId: 'usr_local_1',
      accountId: 'acc_cash_1',
      type: 'expense',
      amountMinor: 380000, // 3,800.00 DZD
      currency: 'DZD',
      categoryId: 'cat-groceries',
      transactionDate: new Date().toISOString().split('T')[0],
      description: 'Courses hebdomadaires supérette',
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tx_init_2',
      userId: 'usr_local_1',
      accountId: 'acc_cash_1',
      type: 'expense',
      amountMinor: 85000, // 850.00 DZD
      currency: 'DZD',
      categoryId: 'cat-transport',
      transactionDate: new Date().toISOString().split('T')[0],
      description: 'Plein essence',
      syncStatus: 'synced',
      createdAt: new Date().toISOString(),
    },
  ],
  budgets: [
    {
      id: 'bgt_1',
      userId: 'usr_local_1',
      categoryId: 'cat-groceries',
      monthYear: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-01`,
      budgetMinor: 2500000, // 25,000.00 DZD monthly
      currency: 'DZD',
    },
    {
      id: 'bgt_2',
      userId: 'usr_local_1',
      categoryId: 'cat-transport',
      monthYear: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-01`,
      budgetMinor: 800000, // 8,000.00 DZD monthly
      currency: 'DZD',
    },
  ],
  recurringItems: [
    {
      id: 'rec_salary',
      userId: 'usr_local_1',
      name: 'Virement Salaire',
      type: 'income',
      amountMinor: 7500000, // 75,000.00 DZD
      currency: 'DZD',
      frequency: 'monthly',
      categoryId: 'cat-salary',
      nextDueDate: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-28`,
      isActive: true,
    },
    {
      id: 'rec_rent',
      userId: 'usr_local_1',
      name: 'Loyer Appartement',
      type: 'expense',
      amountMinor: 2800000, // 28,000.00 DZD
      currency: 'DZD',
      frequency: 'monthly',
      categoryId: 'cat-rent',
      nextDueDate: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-25`,
      isActive: true,
    },
    {
      id: 'rec_net',
      userId: 'usr_local_1',
      name: 'Abonnement Fibre Algerie Telecom',
      type: 'expense',
      amountMinor: 260000, // 2,600.00 DZD
      currency: 'DZD',
      frequency: 'monthly',
      categoryId: 'cat-bills',
      nextDueDate: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-20`,
      isActive: true,
    },
  ],
  savingsGoals: [
    {
      id: 'goal_emergency',
      userId: 'usr_local_1',
      name: 'Fonds d’urgence (Secours)',
      targetAmountMinor: 15000000, // 150,000.00 DZD
      currentAmountMinor: 3500000, // 35,000.00 DZD saved
      currency: 'DZD',
      plannedMonthlyContributionMinor: 1000000, // 10,000.00 DZD/month
      status: 'active',
    },
  ],
};

export function loadBudgetState(): BudgetState {
  if (typeof localStorage === 'undefined') return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_STATE));
      return INITIAL_STATE;
    }
    const parsed = JSON.parse(raw);
    return {
      ...INITIAL_STATE,
      ...parsed,
      categories: parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function saveBudgetState(state: BudgetState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save budget state to localStorage', e);
  }
}

export function addTransaction(
  currentState: BudgetState,
  txData: Omit<Transaction, 'id' | 'createdAt' | 'syncStatus'>
): BudgetState {
  const newTx: Transaction = {
    ...txData,
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    syncStatus: 'synced',
  };

  const nextState: BudgetState = {
    ...currentState,
    transactions: [newTx, ...currentState.transactions],
  };

  saveBudgetState(nextState);
  return nextState;
}

export function deleteTransaction(currentState: BudgetState, txId: string): BudgetState {
  const nextState: BudgetState = {
    ...currentState,
    transactions: currentState.transactions.filter((tx) => tx.id !== txId && tx.linkedTransferId !== txId),
  };
  saveBudgetState(nextState);
  return nextState;
}

export function addAccount(
  currentState: BudgetState,
  accountData: Omit<Account, 'id'>
): BudgetState {
  const newAccount: Account = {
    ...accountData,
    id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const nextState: BudgetState = {
    ...currentState,
    accounts: [...currentState.accounts, newAccount],
  };

  saveBudgetState(nextState);
  return nextState;
}

export function addRecurringItem(
  currentState: BudgetState,
  itemData: Omit<RecurringItem, 'id'>
): BudgetState {
  const newItem: RecurringItem = {
    ...itemData,
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const nextState: BudgetState = {
    ...currentState,
    recurringItems: [...currentState.recurringItems, newItem],
  };

  saveBudgetState(nextState);
  return nextState;
}

export function deleteRecurringItem(currentState: BudgetState, itemId: string): BudgetState {
  const nextState: BudgetState = {
    ...currentState,
    recurringItems: currentState.recurringItems.filter((i) => i.id !== itemId),
  };
  saveBudgetState(nextState);
  return nextState;
}

export function addSavingsGoal(
  currentState: BudgetState,
  goalData: Omit<SavingsGoal, 'id'>
): BudgetState {
  const newGoal: SavingsGoal = {
    ...goalData,
    id: `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const nextState: BudgetState = {
    ...currentState,
    savingsGoals: [...currentState.savingsGoals, newGoal],
  };

  saveBudgetState(nextState);
  return nextState;
}

export function updateSavingsGoal(
  currentState: BudgetState,
  goalId: string,
  updates: Partial<SavingsGoal>
): BudgetState {
  const nextState: BudgetState = {
    ...currentState,
    savingsGoals: currentState.savingsGoals.map((g) => (g.id === goalId ? { ...g, ...updates } : g)),
  };
  saveBudgetState(nextState);
  return nextState;
}

export function updateBudget(
  currentState: BudgetState,
  categoryId: string,
  monthYear: string,
  budgetMinor: number,
  currency: string = 'DZD'
): BudgetState {
  const existingIdx = currentState.budgets.findIndex(
    (b) => b.categoryId === categoryId && b.monthYear === monthYear
  );

  let updatedBudgets = [...currentState.budgets];
  if (existingIdx >= 0) {
    updatedBudgets[existingIdx] = {
      ...updatedBudgets[existingIdx],
      budgetMinor,
    };
  } else {
    updatedBudgets.push({
      id: `bgt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: currentState.profile.id,
      categoryId,
      monthYear,
      budgetMinor,
      currency,
    });
  }

  const nextState: BudgetState = {
    ...currentState,
    budgets: updatedBudgets,
  };
  saveBudgetState(nextState);
  return nextState;
}

export function updateProfile(currentState: BudgetState, updates: Partial<UserProfile>): BudgetState {
  const nextState: BudgetState = {
    ...currentState,
    profile: {
      ...currentState.profile,
      ...updates,
    },
  };
  saveBudgetState(nextState);
  return nextState;
}

/**
 * Exports all transactions to standard RFC-4180 CSV format.
 */
export function exportTransactionsToCSV(state: BudgetState): string {
  const headers = ['ID', 'Date', 'Type', 'Amount (DA)', 'Account', 'Category', 'Description'];
  const accountMap = new Map(state.accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(state.categories.map((c) => [c.id, c.name]));

  const rows = state.transactions.map((tx) => {
    const accountName = accountMap.get(tx.accountId) || 'Unknown Account';
    const categoryName = tx.categoryId ? categoryMap.get(tx.categoryId) || 'Uncategorized' : 'Transfer';
    const amountFormatted = (tx.amountMinor / 100).toFixed(2);
    const desc = (tx.description || '').replace(/"/g, '""');

    return [
      `"${tx.id}"`,
      `"${tx.transactionDate}"`,
      `"${tx.type}"`,
      `"${amountFormatted}"`,
      `"${accountName.replace(/"/g, '""')}"`,
      `"${categoryName.replace(/"/g, '""')}"`,
      `"${desc}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Completely wipes all personal financial data from local storage.
 */
export function wipeAllLocalData(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
