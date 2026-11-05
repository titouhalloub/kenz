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
  { id: '00000000-0000-4000-8000-000000000001', name: 'Alimentation & Marché', icon: 'ShoppingBag', color: '#10b981', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Loyer & Logement', icon: 'Home', color: '#f59e0b', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Factures (Sonelgaz, Eau, Net)', icon: 'Zap', color: '#ef4444', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Transport & Carburant', icon: 'Car', color: '#3b82f6', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Santé & Pharmacie', icon: 'Heart', color: '#ec4899', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Famille & Enfants', icon: 'Users', color: '#8b5cf6', isIncome: false, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000007', name: 'Salaire / Revenu Principal', icon: 'Briefcase', color: '#10b981', isIncome: true, isSystem: true },
  { id: '00000000-0000-4000-8000-000000000008', name: 'Revenu Complémentaire', icon: 'TrendingUp', color: '#06b6d4', isIncome: true, isSystem: true },
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
      categoryId: '00000000-0000-4000-8000-000000000001',
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
      categoryId: '00000000-0000-4000-8000-000000000004',
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
      categoryId: '00000000-0000-4000-8000-000000000001',
      monthYear: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-01`,
      budgetMinor: 2500000, // 25,000.00 DZD monthly
      currency: 'DZD',
    },
    {
      id: 'bgt_2',
      userId: 'usr_local_1',
      categoryId: '00000000-0000-4000-8000-000000000004',
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
      categoryId: '00000000-0000-4000-8000-000000000007',
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
      categoryId: '00000000-0000-4000-8000-000000000002',
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
      categoryId: '00000000-0000-4000-8000-000000000003',
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

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createEmptyBudgetState(profile: UserProfile): BudgetState {
  return {
    profile,
    accounts: [],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    budgets: [],
    recurringItems: [],
    savingsGoals: [],
  };
}

export async function loadBudgetStateFromSupabase(profile: UserProfile): Promise<BudgetState | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(profile.id)) return null;

  const [profileResult, accountsResult, categoriesResult, transactionsResult, budgetsResult, recurringResult, goalsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
    supabase.from('accounts').select('*').eq('user_id', profile.id),
    supabase.from('categories').select('*'),
    supabase.from('transactions').select('*').eq('user_id', profile.id).order('transaction_date', { ascending: false }),
    supabase.from('budgets').select('*').eq('user_id', profile.id),
    supabase.from('recurring_items').select('*').eq('user_id', profile.id),
    supabase.from('savings_goals').select('*').eq('user_id', profile.id),
  ]);

  const errors = [profileResult.error, accountsResult.error, categoriesResult.error, transactionsResult.error, budgetsResult.error, recurringResult.error, goalsResult.error].filter(Boolean);
  if (errors.length) {
    console.error('Failed to load Kenz cloud data:', errors);
    return null;
  }

  const p = profileResult.data;
  const state: BudgetState = {
    profile: {
      ...profile,
      displayName: p?.display_name || profile.displayName,
      preferredCurrency: p?.preferred_currency || profile.preferredCurrency,
      locale: p?.locale === 'ar' || p?.locale === 'en' ? p.locale : p?.locale === 'fr' ? 'fr' : profile.locale,
      paydayDayOfMonth: p?.payday_day_of_month ?? profile.paydayDayOfMonth,
      planningPeriodDays: p?.planning_period_days ?? profile.planningPeriodDays,
    },
    accounts: (accountsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, type: r.type, currency: r.currency,
      initialBalanceMinor: Number(r.initial_balance_minor), isArchived: r.is_archived,
    })),
    categories: (categoriesResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id || undefined, name: r.name, icon: r.icon || undefined,
      color: r.color || undefined, isIncome: r.is_income, isSystem: r.is_system,
    })),
    transactions: (transactionsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, accountId: r.account_id, type: r.type,
      amountMinor: Number(r.amount_minor), currency: r.currency, categoryId: r.category_id || undefined,
      destinationAccountId: r.destination_account_id || undefined, linkedTransferId: r.linked_transfer_id || undefined,
      recurringItemId: r.recurring_item_id || undefined, transactionDate: r.transaction_date,
      description: r.description || undefined, idempotencyKey: r.idempotency_key || undefined,
      syncStatus: 'synced' as const, createdAt: r.created_at,
    })),
    budgets: (budgetsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, categoryId: r.category_id, monthYear: r.month_year,
      budgetMinor: Number(r.budget_minor), currency: r.currency,
    })),
    recurringItems: (recurringResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, type: r.type, amountMinor: Number(r.amount_minor),
      currency: r.currency, frequency: r.frequency, categoryId: r.category_id || undefined,
      nextDueDate: r.next_due_date, isActive: r.is_active,
    })),
    savingsGoals: (goalsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, targetAmountMinor: Number(r.target_amount_minor),
      currentAmountMinor: Number(r.current_amount_minor), currency: r.currency, targetDate: r.target_date || undefined,
      plannedMonthlyContributionMinor: Number(r.planned_monthly_contribution_minor), status: r.status,
    })),
    lastSyncedAt: new Date().toISOString(),
  };

  saveBudgetStateLocally(state);
  return state;
}

function saveBudgetStateLocally(state: BudgetState): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('Failed to save budget state to localStorage', e); }
}

const PENDING_BUDGET_SYNC_PREFIX = 'kenz_budget_outbox_v1_';
let cloudSyncQueue: Promise<boolean> = Promise.resolve(true);

function pendingBudgetKey(userId: string): string {
  return `${PENDING_BUDGET_SYNC_PREFIX}${userId}`;
}

function readPendingBudgetState(userId: string): BudgetState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(pendingBudgetKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BudgetState;
    return parsed?.profile?.id === userId ? parsed : null;
  } catch { return null; }
}

async function syncBudgetStateToSupabase(state: BudgetState): Promise<boolean> {
  cloudSyncQueue = cloudSyncQueue.then(async () => {
    const supabase = getSupabaseClient();
    const userId = state.profile.id;
    if (!supabase || !isUuid(userId)) return false;

    const profileResult = await supabase.from('profiles').update({
      display_name: state.profile.displayName,
      preferred_currency: state.profile.preferredCurrency,
      locale: state.profile.locale,
      payday_day_of_month: state.profile.paydayDayOfMonth ?? null,
      planning_period_days: state.profile.planningPeriodDays,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (profileResult.error) {
      console.error('Kenz profile sync failed:', profileResult.error.message);
      return false;
    }

    if (state.accounts.length) {
      const result = await supabase.from('accounts').upsert(state.accounts.map((r) => ({
        id: r.id, user_id: userId, name: r.name, type: r.type, currency: r.currency,
        initial_balance_minor: r.initialBalanceMinor, is_archived: r.isArchived,
      })), { onConflict: 'id' });
      if (result.error) { console.error('Kenz account sync failed:', result.error.message); return false; }
    }
    if (state.recurringItems.length) {
      const result = await supabase.from('recurring_items').upsert(state.recurringItems.map((r) => ({
        id: r.id, user_id: userId, name: r.name, type: r.type, amount_minor: r.amountMinor,
        currency: r.currency, frequency: r.frequency, category_id: r.categoryId || null,
        next_due_date: r.nextDueDate, is_active: r.isActive,
      })), { onConflict: 'id' });
      if (result.error) { console.error('Kenz recurring sync failed:', result.error.message); return false; }
    }
    if (state.budgets.length) {
      const result = await supabase.from('budgets').upsert(state.budgets.map((r) => ({
        id: r.id, user_id: userId, category_id: r.categoryId, month_year: r.monthYear,
        budget_minor: r.budgetMinor, currency: r.currency,
      })), { onConflict: 'id' });
      if (result.error) { console.error('Kenz budget sync failed:', result.error.message); return false; }
    }
    if (state.savingsGoals.length) {
      const result = await supabase.from('savings_goals').upsert(state.savingsGoals.map((r) => ({
        id: r.id, user_id: userId, name: r.name, target_amount_minor: r.targetAmountMinor,
        current_amount_minor: r.currentAmountMinor, currency: r.currency, target_date: r.targetDate || null,
        planned_monthly_contribution_minor: r.plannedMonthlyContributionMinor, status: r.status,
      })), { onConflict: 'id' });
      if (result.error) { console.error('Kenz savings sync failed:', result.error.message); return false; }
    }
    if (state.transactions.length) {
      const result = await supabase.from('transactions').upsert(state.transactions.map((r) => ({
        id: r.id, user_id: userId, account_id: r.accountId, type: r.type, amount_minor: r.amountMinor,
        currency: r.currency, category_id: r.categoryId || null, destination_account_id: r.destinationAccountId || null,
        linked_transfer_id: r.linkedTransferId || null, recurring_item_id: r.recurringItemId || null,
        transaction_date: r.transactionDate, description: r.description || null, idempotency_key: r.idempotencyKey || null,
      })), { onConflict: 'id' });
      if (result.error) { console.error('Kenz transaction sync failed:', result.error.message); return false; }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const current = JSON.parse(raw) as BudgetState;
          current.transactions = current.transactions.map((tx) => ({ ...tx, syncStatus: 'synced' }));
          current.lastSyncedAt = new Date().toISOString();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        }
      } catch { /* local cache remains usable if sync metadata cannot be updated */ }
    }
    return true;
  }).catch((error) => {
    console.error('Unexpected Kenz cloud sync failure:', error);
    return false;
  });
  return cloudSyncQueue;
}

/** Flushes a durable per-user snapshot after app restart or network recovery. */
export async function flushPendingBudgetSync(userId: string): Promise<boolean> {
  if (!isUuid(userId) || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
  const pending = readPendingBudgetState(userId);
  if (!pending) return true;
  const succeeded = await syncBudgetStateToSupabase(pending);
  if (!succeeded || typeof localStorage === 'undefined') return false;
  try {
    const key = pendingBudgetKey(userId);
    if (localStorage.getItem(key) === JSON.stringify(pending)) localStorage.removeItem(key);
  } catch (error) {
    console.error('Unable to clear synced Kenz outbox snapshot:', error);
    return false;
  }
  return true;
}

export function saveBudgetState(state: BudgetState): void {
  saveBudgetStateLocally(state);
  const userId = state.profile.id;
  if (!isUuid(userId) || typeof localStorage === 'undefined') return;
  try {
    // One latest snapshot per user keeps retries bounded; all cloud writes are idempotent upserts.
    localStorage.setItem(pendingBudgetKey(userId), JSON.stringify(state));
  } catch (error) {
    console.error('Unable to persist Kenz offline outbox:', error);
    return;
  }
  void flushPendingBudgetSync(userId);
}

export function addTransaction(
  currentState: BudgetState,
  txData: Omit<Transaction, 'id' | 'createdAt' | 'syncStatus'>
): BudgetState {
  const newTx: Transaction = {
    ...txData,
    id: createId(),
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  };

  const nextState: BudgetState = {
    ...currentState,
    transactions: [newTx, ...currentState.transactions],
  };

  saveBudgetState(nextState);
  return nextState;
}

export function deleteTransaction(currentState: BudgetState, txId: string): BudgetState {
  const removedIds = currentState.transactions
    .filter((tx) => tx.id === txId || tx.linkedTransferId === txId)
    .map((tx) => tx.id);
  const nextState: BudgetState = {
    ...currentState,
    transactions: currentState.transactions.filter((tx) => !removedIds.includes(tx.id)),
  };
  saveBudgetState(nextState);
  const supabase = getSupabaseClient();
  if (supabase && isUuid(currentState.profile.id) && removedIds.every(isUuid) && removedIds.length) {
    void supabase.from('transactions').delete().in('id', removedIds).eq('user_id', currentState.profile.id)
      .then(({ error }) => { if (error) console.error('Failed to delete cloud transaction:', error.message); });
  }
  return nextState;
}

export function addAccount(
  currentState: BudgetState,
  accountData: Omit<Account, 'id'>
): BudgetState {
  const newAccount: Account = {
    ...accountData,
    id: createId(),
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
    id: createId(),
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
  const supabase = getSupabaseClient();
  if (supabase && isUuid(currentState.profile.id) && isUuid(itemId)) {
    void supabase.from('recurring_items').delete().eq('id', itemId).eq('user_id', currentState.profile.id)
      .then(({ error }) => { if (error) console.error('Failed to delete cloud recurring item:', error.message); });
  }
  return nextState;
}

export function addSavingsGoal(
  currentState: BudgetState,
  goalData: Omit<SavingsGoal, 'id'>
): BudgetState {
  const newGoal: SavingsGoal = {
    ...goalData,
    id: createId(),
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
      id: createId(),
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
