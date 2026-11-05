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

function budgetStorageKey(userId?: string): string {
  return userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

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

export function loadBudgetState(profile?: UserProfile): BudgetState {
  const authenticated = Boolean(profile && isUuid(profile.id));
  const fallback = authenticated ? createEmptyBudgetState(profile!) : INITIAL_STATE;
  if (typeof localStorage === 'undefined') return fallback;
  const key = budgetStorageKey(profile?.id);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      profile: authenticated ? { ...fallback.profile, ...parsed.profile, id: profile!.id } : { ...fallback.profile, ...parsed.profile },
      categories: parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
    };
  } catch { return fallback; }
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

export async function loadBudgetStateFromSupabase(profile: UserProfile, persistLocal = true, ignorePendingOutbox = false): Promise<BudgetState | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(profile.id)) return null;
  if (!ignorePendingOutbox && readPendingBudgetOutbox(profile.id)) return loadBudgetState(profile);

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
      syncUpdatedAt: p?.updated_at || p?.created_at,
    },
    accounts: (accountsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, type: r.type, currency: r.currency,
      initialBalanceMinor: Number(r.initial_balance_minor), isArchived: r.is_archived,
      syncUpdatedAt: r.updated_at || r.created_at,
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
      syncStatus: 'synced' as const, createdAt: r.created_at, syncUpdatedAt: r.updated_at || r.created_at,
    })),
    budgets: (budgetsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, categoryId: r.category_id, monthYear: r.month_year,
      budgetMinor: Number(r.budget_minor), currency: r.currency, syncUpdatedAt: r.updated_at || r.created_at,
    })),
    recurringItems: (recurringResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, type: r.type, amountMinor: Number(r.amount_minor),
      currency: r.currency, frequency: r.frequency, categoryId: r.category_id || undefined,
      nextDueDate: r.next_due_date, isActive: r.is_active,
      accountId: r.account_id || undefined,
      billingDayOfMonth: r.billing_day_of_month == null ? undefined : Number(r.billing_day_of_month),
      reminderEnabled: r.reminder_enabled ?? false,
      reminderDaysBefore: r.reminder_days_before == null ? 1 : Number(r.reminder_days_before),
      syncUpdatedAt: r.updated_at || r.created_at,
    })),
    savingsGoals: (goalsResult.data || []).map((r) => ({
      id: r.id, userId: r.user_id, name: r.name, targetAmountMinor: Number(r.target_amount_minor),
      currentAmountMinor: Number(r.current_amount_minor), currency: r.currency, targetDate: r.target_date || undefined,
      plannedMonthlyContributionMinor: Number(r.planned_monthly_contribution_minor), status: r.status,
      challengeFrequency: r.challenge_frequency || undefined,
      challengePeriodAmountMinor: r.challenge_period_amount_minor == null ? undefined : Number(r.challenge_period_amount_minor),
      challengeStartDate: r.challenge_start_date || undefined,
      challengeEndDate: r.challenge_end_date || undefined,
      challengeStartingAmountMinor: r.challenge_starting_amount_minor == null ? undefined : Number(r.challenge_starting_amount_minor),
      syncUpdatedAt: r.updated_at || r.created_at,
    })),
    lastSyncedAt: new Date().toISOString(),
  };

  if (persistLocal) saveBudgetStateLocally(state);
  return state;
}

function saveBudgetStateLocally(state: BudgetState): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(budgetStorageKey(state.profile.id), JSON.stringify(state)); }
  catch (e) { console.error('Failed to save budget state to localStorage', e); }
}

const PENDING_BUDGET_SYNC_PREFIX = 'kenz_budget_outbox_v2_';
type BudgetCollection = 'transactions' | 'recurringItems' | 'budgets' | 'savingsGoals' | 'accounts';
interface PendingBudgetOutbox { version: 2; state: BudgetState; baseState: BudgetState; deleted: Record<BudgetCollection, string[]>; updatedAt: string; }
let cloudSyncQueue: Promise<boolean> = Promise.resolve(true);

function pendingBudgetKey(userId: string): string {
  return PENDING_BUDGET_SYNC_PREFIX + userId;
}

function emptyDeletedIds(): PendingBudgetOutbox['deleted'] {
  return { transactions: [], recurringItems: [], budgets: [], savingsGoals: [], accounts: [] };
}

function readPendingBudgetOutbox(userId: string): PendingBudgetOutbox | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const key = pendingBudgetKey(userId);
    const legacyKey = `kenz_budget_outbox_v1_${userId}`;
    const raw = localStorage.getItem(key) || localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const state: BudgetState = parsed?.state || parsed as BudgetState;
    if (state?.profile?.id !== userId) return null;
    const legacySnapshot = !parsed?.baseState;
    const outbox: PendingBudgetOutbox = {
      version: 2, state,
      // A v1 full-snapshot queue has no trustworthy ancestor. Treat its rows
      // as pending additions and retain them during the one-time migration.
      baseState: parsed?.baseState || createEmptyBudgetState(state.profile),
      deleted: { ...emptyDeletedIds(), ...(parsed?.deleted || {}) },
      updatedAt: parsed?.updatedAt || (legacySnapshot ? new Date().toISOString() : new Date(0).toISOString()),
    };
    if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(outbox)); localStorage.removeItem(legacyKey); }
    return outbox;
  } catch { return null; }
}

function sameSyncValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function mergeSyncRecord<T extends { id: string }>(local: T, remote: T, base: T | undefined, localStamp: string): T {
  if (!base) return JSON.stringify(local) > JSON.stringify(remote) ? { ...remote, ...local } : { ...local, ...remote };
  const merged: Record<string, unknown> = { ...remote };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    if (key === 'syncUpdatedAt' || key === 'syncStatus') continue;
    const before = (base as any)[key], left = (local as any)[key], right = (remote as any)[key];
    const leftChanged = !sameSyncValue(left, before), rightChanged = !sameSyncValue(right, before);
    if (leftChanged && !rightChanged) merged[key] = left;
    else if (leftChanged && rightChanged && sameSyncValue(left, right)) merged[key] = left;
    else if (leftChanged && rightChanged) {
      const leftTime = Date.parse(localStamp) || 0;
      const rightTime = Date.parse((remote as any).syncUpdatedAt || '') || 0;
      if (leftTime > rightTime || (leftTime === rightTime && JSON.stringify(left) > JSON.stringify(right))) merged[key] = left;
    }
  }
  if ('syncStatus' in local || 'syncStatus' in remote) merged.syncStatus = 'synced';
  return merged as T;
}

export function mergeBudgetSnapshots(
  local: BudgetState, remote: BudgetState, base: BudgetState,
  deleted: Record<BudgetCollection, string[]>, localStamp: string,
): BudgetState {
  const mergeRows = <T extends { id: string }>(key: BudgetCollection): T[] => {
    const left = local[key] as unknown as T[], right = remote[key] as unknown as T[], ancestor = base[key] as unknown as T[];
    const lm = new Map(left.map((row) => [row.id, row]));
    const rm = new Map(right.map((row) => [row.id, row]));
    const bm = new Map(ancestor.map((row) => [row.id, row]));
    const removed = new Set(deleted[key]);
    const result: T[] = [];
    for (const id of new Set([...lm.keys(), ...rm.keys()])) {
      if (removed.has(id)) continue;
      const l = lm.get(id), r = rm.get(id), b = bm.get(id);
      if (l && r) result.push(mergeSyncRecord(l, r, b, localStamp));
      else if (l && (!b || !sameSyncValue(l, b))) result.push(l);
      else if (r && l === undefined) result.push(r);
    }
    return result;
  };
  return {
    ...remote,
    profile: mergeSyncRecord(local.profile as any, remote.profile as any, base.profile as any, localStamp),
    accounts: mergeRows('accounts'),
    transactions: mergeRows('transactions'),
    budgets: mergeRows('budgets'),
    recurringItems: mergeRows('recurringItems'),
    savingsGoals: mergeRows('savingsGoals'),
    categories: remote.categories,
    lastSyncedAt: new Date().toISOString(),
  };
}

function toFinancialSyncPayload(state: BudgetState): Record<string, unknown> {
  return {
    profile: {
      id: state.profile.id, display_name: state.profile.displayName,
      preferred_currency: state.profile.preferredCurrency, locale: state.profile.locale,
      payday_day_of_month: state.profile.paydayDayOfMonth ?? null,
      planning_period_days: state.profile.planningPeriodDays,
      updated_at: state.profile.syncUpdatedAt || null,
    },
    accounts: state.accounts.map((r) => ({
      id: r.id, user_id: r.userId, name: r.name, type: r.type, currency: r.currency,
      initial_balance_minor: r.initialBalanceMinor, is_archived: r.isArchived,
      updated_at: r.syncUpdatedAt || null,
    })),
    transactions: state.transactions.map((r) => ({
      id: r.id, user_id: r.userId, account_id: r.accountId, type: r.type,
      amount_minor: r.amountMinor, currency: r.currency, category_id: r.categoryId || null,
      destination_account_id: r.destinationAccountId || null, linked_transfer_id: r.linkedTransferId || null,
      recurring_item_id: r.recurringItemId || null, transaction_date: r.transactionDate,
      description: r.description || null, idempotency_key: r.idempotencyKey || null,
      updated_at: r.syncUpdatedAt || null,
    })),
    budgets: state.budgets.map((r) => ({
      id: r.id, user_id: r.userId, category_id: r.categoryId, month_year: r.monthYear,
      budget_minor: r.budgetMinor, currency: r.currency, updated_at: r.syncUpdatedAt || null,
    })),
    recurring_items: state.recurringItems.map((r) => ({
      id: r.id, user_id: r.userId, name: r.name, type: r.type, amount_minor: r.amountMinor,
      currency: r.currency, frequency: r.frequency, category_id: r.categoryId || null,
      next_due_date: r.nextDueDate, is_active: r.isActive,
      account_id: r.accountId || null,
      billing_day_of_month: r.billingDayOfMonth ?? Number(r.nextDueDate.slice(8, 10)),
      reminder_enabled: r.reminderEnabled ?? false,
      reminder_days_before: r.reminderDaysBefore ?? 1,
      updated_at: r.syncUpdatedAt || null,
    })),
    savings_goals: state.savingsGoals.map((r) => ({
      id: r.id, user_id: r.userId, name: r.name, target_amount_minor: r.targetAmountMinor,
      current_amount_minor: r.currentAmountMinor, currency: r.currency, target_date: r.targetDate || null,
      planned_monthly_contribution_minor: r.plannedMonthlyContributionMinor,
      status: r.status, challenge_frequency: r.challengeFrequency || null,
      challenge_period_amount_minor: r.challengePeriodAmountMinor ?? null,
      challenge_start_date: r.challengeStartDate || null,
      challenge_end_date: r.challengeEndDate || null,
      challenge_starting_amount_minor: r.challengeStartingAmountMinor ?? null,
      updated_at: r.syncUpdatedAt || null,
    })),
    festive_budgets: [],
  };
}

function toDeletedSyncPayload(deleted: PendingBudgetOutbox['deleted']): Record<string, string[]> {
  return {
    accounts: deleted.accounts, transactions: deleted.transactions,
    budgets: deleted.budgets, recurring_items: deleted.recurringItems,
    savings_goals: deleted.savingsGoals, festive_budgets: [],
  };
}

async function syncBudgetStateToSupabase(state: BudgetState, deleted: PendingBudgetOutbox['deleted'], baseState: BudgetState, localStamp: string, expectedRaw: string): Promise<boolean> {
  cloudSyncQueue = cloudSyncQueue.then(async () => {
    const supabase = getSupabaseClient();
    const userId = state.profile.id;
    if (!supabase || !isUuid(userId)) return false;
    const { error: atomicError } = await supabase.rpc('sync_kenz_financial_snapshot', {
      p_snapshot: toFinancialSyncPayload(state),
      p_base: toFinancialSyncPayload(baseState),
      p_deleted: toDeletedSyncPayload(deleted),
      p_updated_at: localStamp,
    });
    if (atomicError) {
      console.error('Atomic Kenz financial sync failed:', atomicError.message);
      return false;
    }
    const latest = await loadBudgetStateFromSupabase(state.profile, false, true);
    if (!latest) return false;
    if (typeof localStorage !== 'undefined' &&
      localStorage.getItem(pendingBudgetKey(userId)) === expectedRaw) {
      latest.transactions = latest.transactions.map((tx) => ({ ...tx, syncStatus: 'synced' as const }));
      latest.lastSyncedAt = new Date().toISOString();
      saveBudgetStateLocally(latest);
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
  if (typeof localStorage === 'undefined') return false;

  const key = pendingBudgetKey(userId);
  // A save can arrive while an earlier snapshot is in flight. Drain a few
  // successive revisions now instead of leaving the newest edit stranded until
  // the next reconnect or user action. The durable outbox remains if writes
  // continue faster than the bounded drain can complete.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pending = readPendingBudgetOutbox(userId);
    if (!pending) return true;
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const succeeded = await syncBudgetStateToSupabase(
      pending.state, pending.deleted, pending.baseState, pending.updatedAt, raw,
    );
    if (!succeeded) return false;

    const latestRaw = localStorage.getItem(key);
    if (latestRaw === raw) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Unable to clear synced Kenz outbox snapshot:', error);
        return false;
      }
      return true;
    }
    if (!latestRaw) return true;
    // A newer local revision replaced the one just synchronized; loop and send it.
  }
  return false;
}

export function saveBudgetState(state: BudgetState): void {
  const userId = state.profile.id;
  if (!isUuid(userId) || typeof localStorage === 'undefined') { saveBudgetStateLocally(state); return; }
  try {
    const previousRaw = localStorage.getItem(budgetStorageKey(userId));
    const previous = previousRaw ? JSON.parse(previousRaw) as BudgetState : createEmptyBudgetState(state.profile);
    const pending = readPendingBudgetOutbox(userId);
    const deleted = pending?.deleted ?? emptyDeletedIds();
    const collections: BudgetCollection[] = ['transactions', 'recurringItems', 'budgets', 'savingsGoals', 'accounts'];
    for (const collection of collections) {
      const nextIds = new Set(state[collection].map((item) => item.id));
      const tombstones = new Set(deleted[collection]);
      for (const id of previous[collection].map((item) => item.id)) if (!nextIds.has(id) && isUuid(id)) tombstones.add(id);
      for (const id of nextIds) tombstones.delete(id);
      deleted[collection] = [...tombstones];
    }
    const outbox: PendingBudgetOutbox = {
      version: 2,
      state,
      baseState: pending?.baseState || previous,
      deleted,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(pendingBudgetKey(userId), JSON.stringify(outbox));
    saveBudgetStateLocally(state);
  } catch (error) { console.error('Unable to persist Kenz offline outbox:', error); saveBudgetStateLocally(state); return; }
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
  return nextState;
}

export function updateRecurringItem(
  currentState: BudgetState,
  itemId: string,
  updates: Partial<RecurringItem>,
): BudgetState {
  const nextState: BudgetState = {
    ...currentState,
    recurringItems: currentState.recurringItems.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    ),
  };
  saveBudgetState(nextState);
  return nextState;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function nextRecurringDate(item: RecurringItem): string {
  const [year, month, day] = item.nextDueDate.split('-').map(Number);
  if (item.frequency === 'weekly') return addCalendarDays(item.nextDueDate, 7);
  if (item.frequency === 'biweekly') return addCalendarDays(item.nextDueDate, 14);
  const monthsToAdd = item.frequency === 'quarterly' ? 3 : item.frequency === 'yearly' ? 12 : 1;
  const targetMonth = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const anchorDay = item.billingDayOfMonth || day;
  const nextDay = Math.min(anchorDay, lastDay);
  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

/** Records a recurring payment and advances its due date in one offline-safe snapshot. */
export function recordRecurringPayment(currentState: BudgetState, itemId: string): BudgetState {
  const item = currentState.recurringItems.find((row) => row.id === itemId);
  if (!item || !item.isActive || !item.accountId) return currentState;
  const account = currentState.accounts.find((row) => row.id === item.accountId && !row.isArchived);
  if (!account || account.currency !== item.currency) return currentState;
  const paymentKey = `recurring-payment:${item.id}:${item.nextDueDate}`;
  const alreadyRecorded = currentState.transactions.some((tx) => tx.idempotencyKey === paymentKey);
  const localToday = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();
  const nextState: BudgetState = {
    ...currentState,
    transactions: alreadyRecorded ? currentState.transactions : [{
      id: createId(),
      userId: currentState.profile.id,
      accountId: account.id,
      type: item.type,
      amountMinor: item.amountMinor,
      currency: item.currency,
      categoryId: item.categoryId,
      recurringItemId: item.id,
      transactionDate: localToday,
      description: `${item.type === 'expense' ? 'Paiement' : 'Encaissement'} · ${item.name}`,
      idempotencyKey: paymentKey,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
    }, ...currentState.transactions],
    recurringItems: currentState.recurringItems.map((row) => row.id === item.id ? {
      ...row,
      nextDueDate: nextRecurringDate(row),
      billingDayOfMonth: row.billingDayOfMonth || Number(row.nextDueDate.slice(8, 10)),
    } : row),
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
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (key.startsWith(STORAGE_KEY) || key.startsWith('kenz_budget_outbox_v1_') || key.startsWith('kenz_budget_outbox_v2_') || key.startsWith('kenz_savings_challenge_contributions_v1_') || key.startsWith('kenz_bill_reminders_sent_v1_'))) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
