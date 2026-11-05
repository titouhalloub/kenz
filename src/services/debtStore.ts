/**
 * Phase 5 — Neighborhood Debt & Credit Ledger ("Carnet Kredy") & Financial Health Service
 * Local-first storage with deterministic financial health scoring and Supabase sync.
 */

import {
  DebtEntry,
  DebtPayment,
  DebtSummary,
  FinancialHealthScore,
  HealthScoreFactor,
  SafeToSpendBreakdown,
  Account,
  Transaction,
  SavingsGoal,
} from '../domain/types';
import { getSupabaseClient } from './supabase';

const STORAGE_KEY = 'kenz_debts_v1';

// Initial realistic baseline data for an Algerian user
export const INITIAL_DEBTS: DebtEntry[] = [
  {
    id: 'debt_kredy_1',
    userId: 'usr_local_1',
    businessId: 'biz_groceries_1',
    counterpartyName: 'Épicerie El Amel (Ami Mohamed)',
    counterpartyPhone: '+213 550 12 34 56',
    type: 'payable',
    totalAmountMinor: 450000, // 4,500.00 DZD
    remainingAmountMinor: 450000,
    currency: 'DZD',
    dueDate: '2026-10-28', // Align with payday
    notes: 'Achats marché semaine: huile, semoule, lait en sachet',
    status: 'active',
    payments: [],
    createdAt: '2026-10-08T10:00:00Z',
    updatedAt: '2026-10-08T10:00:00Z',
  },
  {
    id: 'debt_kredy_2',
    userId: 'usr_local_1',
    businessId: 'biz_butcher_1',
    counterpartyName: 'Boucherie Moderne (Kamel)',
    counterpartyPhone: '+213 661 98 76 54',
    type: 'payable',
    totalAmountMinor: 600000, // 6,000.00 DZD
    remainingAmountMinor: 400000, // 4,000.00 DZD remaining
    currency: 'DZD',
    dueDate: '2026-10-25',
    notes: 'Viande hachée et poulet fermier',
    status: 'partially_paid',
    payments: [
      {
        id: 'pmt_kredy_2_1',
        debtId: 'debt_kredy_2',
        amountMinor: 200000, // 2,000.00 DZD paid
        paymentDate: '2026-10-10',
        sourceAccountId: 'acc_cash_1',
        notes: 'Versement espèces au comptoir',
        createdAt: '2026-10-10T14:30:00Z',
      },
    ],
    createdAt: '2026-10-05T09:00:00Z',
    updatedAt: '2026-10-10T14:30:00Z',
  },
  {
    id: 'debt_kredy_3',
    userId: 'usr_local_1',
    counterpartyName: 'Karim (Cousin)',
    counterpartyPhone: '+213 770 45 67 89',
    type: 'receivable', // On me doit
    totalAmountMinor: 1500000, // 15,000.00 DZD
    remainingAmountMinor: 1500000,
    currency: 'DZD',
    dueDate: '2026-11-05',
    notes: 'Dépannage réparation véhicule',
    status: 'active',
    payments: [],
    createdAt: '2026-10-02T16:00:00Z',
    updatedAt: '2026-10-02T16:00:00Z',
  },
];

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function localDebtKey(userId?: string): string {
  return userId && isUuid(userId) ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

/** Signed-in users get an isolated cache; demo data is never used as their fallback. */
export function loadDebtState(userId?: string): DebtEntry[] {
  if (typeof localStorage === 'undefined') return userId && isUuid(userId) ? [] : INITIAL_DEBTS;
  try {
    const raw = localStorage.getItem(localDebtKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    if (userId && isUuid(userId)) return [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEBTS));
    return INITIAL_DEBTS;
  } catch {
    return userId && isUuid(userId) ? [] : INITIAL_DEBTS;
  }
}

/** Load only the authenticated user's debts and payment history. */
export async function loadDebtStateFromSupabase(userId: string): Promise<DebtEntry[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return null;
  const { data: debtRows, error: debtError } = await supabase.from('debts').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (debtError) {
    console.error('Failed to load Kredy debts:', debtError.message);
    return null;
  }
  const debtIds = (debtRows || []).map((row) => row.id as string);
  let paymentRows: Record<string, any>[] = [];
  if (debtIds.length) {
    const { data, error } = await supabase.from('debt_payments').select('*')
      .in('debt_id', debtIds).order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load Kredy payment history:', error.message);
      return null;
    }
    paymentRows = (data || []) as Record<string, any>[];
  }
  const paymentsByDebt = new Map<string, DebtPayment[]>();
  for (const row of paymentRows) {
    const payment: DebtPayment = {
      id: row.id, debtId: row.debt_id, amountMinor: Number(row.amount_minor),
      paymentDate: row.payment_date, sourceAccountId: row.source_account_id || undefined,
      notes: row.notes || undefined, createdAt: row.created_at,
    };
    const items = paymentsByDebt.get(payment.debtId) || [];
    items.push(payment);
    paymentsByDebt.set(payment.debtId, items);
  }
  const debts: DebtEntry[] = (debtRows || []).map((row) => ({
    id: row.id, userId: row.user_id, businessId: row.business_id || undefined,
    counterpartyName: row.counterparty_name, counterpartyPhone: row.counterparty_phone || undefined,
    type: row.type, totalAmountMinor: Number(row.total_amount_minor),
    remainingAmountMinor: Number(row.remaining_amount_minor), currency: row.currency,
    dueDate: row.due_date || undefined, notes: row.notes || undefined, status: row.status,
    payments: paymentsByDebt.get(row.id) || [], createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(localDebtKey(userId), JSON.stringify(debts));
  } catch (error) {
    console.error('Failed to cache Kredy data:', error);
  }
  return debts;
}

let debtCloudSyncQueue: Promise<void> = Promise.resolve();

/** Persist locally first, then sync UUID-backed records through the user's RLS session. */
export function saveDebtState(debts: DebtEntry[], ownerId?: string): void {
  const userId = ownerId || debts[0]?.userId;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(localDebtKey(userId), JSON.stringify(debts));
  } catch (err) {
    console.error('Failed to save debts to localStorage:', err);
  }
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !isUuid(userId)) return;
  const ownedDebts = debts.filter((debt) => debt.userId === userId && isUuid(debt.id));
  debtCloudSyncQueue = debtCloudSyncQueue.then(async () => {
    if (!ownedDebts.length) return;
    const { error } = await supabase.from('debts').upsert(ownedDebts.map((d) => ({
      id: d.id, user_id: userId, business_id: d.businessId && isUuid(d.businessId) ? d.businessId : null,
      counterparty_name: d.counterpartyName, counterparty_phone: d.counterpartyPhone || null,
      type: d.type, total_amount_minor: d.totalAmountMinor,
      remaining_amount_minor: d.remainingAmountMinor, currency: d.currency,
      due_date: d.dueDate || null, notes: d.notes || null, status: d.status,
      created_at: d.createdAt, updated_at: d.updatedAt,
    })), { onConflict: 'id' });
    if (error) { console.error('Kredy debt sync failed:', error.message); return; }
    const paymentRows = ownedDebts.flatMap((d) => d.payments.filter((p) => isUuid(p.id)).map((p) => ({
      id: p.id, debt_id: d.id, amount_minor: p.amountMinor,
      payment_date: p.paymentDate, source_account_id: p.sourceAccountId && isUuid(p.sourceAccountId) ? p.sourceAccountId : null,
      notes: p.notes || null, created_at: p.createdAt,
    })));
    if (paymentRows.length) {
      const result = await supabase.from('debt_payments').upsert(paymentRows, { onConflict: 'id' });
      if (result.error) console.error('Kredy payment sync failed:', result.error.message);
    }
  }).catch((error) => console.error('Unexpected Kredy sync failure:', error));
}

/**
 * Adds a new debt or credit entry.
 */
export function addDebtEntry(
  debts: DebtEntry[],
  newDebt: Omit<DebtEntry, 'id' | 'remainingAmountMinor' | 'status' | 'payments' | 'createdAt' | 'updatedAt'>
): DebtEntry[] {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
  const now = new Date().toISOString();
  const entry: DebtEntry = {
    ...newDebt,
    id,
    remainingAmountMinor: newDebt.totalAmountMinor,
    status: 'active',
    payments: [],
    createdAt: now,
    updatedAt: now,
  };

  const next = [entry, ...debts];
  saveDebtState(next);
  return next;
}

/**
 * Records a partial or full payment on a debt.
 */
export function recordDebtPayment(
  debts: DebtEntry[],
  params: {
    debtId: string;
    amountMinor: number;
    paymentDate?: string;
    sourceAccountId?: string;
    notes?: string;
  }
): { nextDebts: DebtEntry[]; payment: DebtPayment | null } {
  const index = debts.findIndex((d) => d.id === params.debtId);
  if (index === -1 || params.amountMinor <= 0) {
    return { nextDebts: debts, payment: null };
  }

  const current = debts[index];
  const paymentAmount = Math.min(params.amountMinor, current.remainingAmountMinor);
  const remaining = Math.max(0, current.remainingAmountMinor - paymentAmount);

  const payment: DebtPayment = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }),
    debtId: current.id,
    amountMinor: paymentAmount,
    paymentDate: params.paymentDate || new Date().toISOString().split('T')[0],
    sourceAccountId: params.sourceAccountId,
    notes: params.notes,
    createdAt: new Date().toISOString(),
  };

  const nextStatus = remaining === 0 ? 'settled' : 'partially_paid';

  const updatedDebt: DebtEntry = {
    ...current,
    remainingAmountMinor: remaining,
    status: nextStatus,
    payments: [payment, ...current.payments],
    updatedAt: new Date().toISOString(),
  };

  const nextDebts = [...debts];
  nextDebts[index] = updatedDebt;
  saveDebtState(nextDebts);

  return { nextDebts, payment };
}

/**
 * Deletes a debt entry.
 */
export function deleteDebtEntry(debts: DebtEntry[], debtId: string): DebtEntry[] {
  const target = debts.find((d) => d.id === debtId);
  const next = debts.filter((d) => d.id !== debtId);
  saveDebtState(next, target?.userId);
  const supabase = getSupabaseClient();
  if (supabase && target && isUuid(target.userId) && isUuid(debtId)) {
    void supabase.from('debts').delete().eq('id', debtId).eq('user_id', target.userId)
      .then(({ error }) => { if (error) console.error('Failed to delete cloud Kredy debt:', error.message); });
  }
  return next;
}

/**
 * Calculates consolidated summary of debts and receivables.
 */
export function calculateDebtSummary(debts: DebtEntry[], todayDate: Date = new Date()): DebtSummary {
  const todayStr = todayDate.toISOString().split('T')[0];
  let totalPayableMinor = 0;
  let totalReceivableMinor = 0;
  let overdueCount = 0;
  let activeCount = 0;
  let settledCount = 0;

  for (const debt of debts) {
    if (debt.status === 'settled') {
      settledCount++;
      continue;
    }

    activeCount++;

    if (debt.type === 'payable') {
      totalPayableMinor += debt.remainingAmountMinor;
    } else {
      totalReceivableMinor += debt.remainingAmountMinor;
    }

    if (debt.dueDate && debt.dueDate < todayStr && debt.remainingAmountMinor > 0) {
      overdueCount++;
    }
  }

  return {
    totalPayableMinor,
    totalReceivableMinor,
    netDebtMinor: totalReceivableMinor - totalPayableMinor,
    overdueCount,
    activeCount,
    settledCount,
  };
}

/**
 * Computes deterministic Financial Health Score (0 - 100) and provides explainable diagnostics.
 */
export function calculateFinancialHealthScore(params: {
  safeToSpend: SafeToSpendBreakdown;
  accounts: Account[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  debts: DebtEntry[];
}): FinancialHealthScore {
  const { safeToSpend, accounts, savingsGoals, debts } = params;

  // 1. Total liquid assets
  const liquidAssetsMinor = accounts
    .filter((a) => !a.isArchived)
    .reduce((sum, a) => sum + a.initialBalanceMinor, 0);

  // 2. Debt summary
  const summary = calculateDebtSummary(debts);

  // 3. Planned savings
  const activeSavingsMinor = savingsGoals
    .filter((g) => g.status === 'active')
    .reduce((sum, g) => sum + g.currentAmountMinor, 0);

  const factors: HealthScoreFactor[] = [];
  let score = 70; // Baseline neutral score

  // Evaluation Factor 1: Safe-To-Spend Liquidity Buffer
  if (safeToSpend.safeToSpendMinor > 1000000) {
    // > 10,000 DA safe-to-spend
    score += 15;
    factors.push({
      id: 'f_safe_spend_high',
      title: 'Trésorerie disponible saine',
      impact: 'positive',
      description: 'Votre reste à vivre disponible protège confortablement vos dépenses courantes.',
    });
  } else if (safeToSpend.safeToSpendMinor >= 0) {
    score += 5;
    factors.push({
      id: 'f_safe_spend_ok',
      title: 'Équilibre budgétaire respecté',
      impact: 'neutral',
      description: 'Vos engagements obligatoires sont couverts jusqu’à la prochaine paie.',
    });
  } else {
    score -= 25;
    factors.push({
      id: 'f_safe_spend_deficit',
      title: 'Déficit sur le reste à vivre',
      impact: 'critical',
      description: 'Vos factures et engagements dépassent vos liquidités actuelles.',
    });
  }

  // Evaluation Factor 2: Carnet Kredy (Payable debts)
  if (summary.totalPayableMinor === 0) {
    score += 10;
    factors.push({
      id: 'f_no_debt',
      title: 'Zéro dette quartier',
      impact: 'positive',
      description: 'Aucune ardoise ou dette fournisseur en cours.',
    });
  } else if (summary.totalPayableMinor < liquidAssetsMinor * 0.3) {
    score += 0;
    factors.push({
      id: 'f_debt_moderate',
      title: 'Dettes quartier sous contrôle',
      impact: 'neutral',
      description: 'Vos ardoises commerçants représentent moins de 30% de vos avoirs disponibles.',
    });
  } else {
    score -= 15;
    factors.push({
      id: 'f_debt_heavy',
      title: 'Endettement quartier élevé',
      impact: 'warning',
      description: 'Vos ardoises commerçants pèsent lourdement face à vos liquidités.',
    });
  }

  // Evaluation Factor 3: Overdue Kredy
  if (summary.overdueCount > 0) {
    score -= 10 * Math.min(3, summary.overdueCount);
    factors.push({
      id: 'f_overdue_debts',
      title: `${summary.overdueCount} échéance(s) dépassée(s)`,
      impact: 'warning',
      description: 'Pensez à régulariser vos ardoises auprès de vos commerçants de proximité.',
    });
  }

  // Evaluation Factor 4: Savings cushion
  if (activeSavingsMinor > 5000000) {
    // > 50,000 DA saved
    score += 10;
    factors.push({
      id: 'f_savings_healthy',
      title: 'Épargne de précaution solide',
      impact: 'positive',
      description: 'Vos réserves d’épargne sécurisent les aléas sans toucher aux dépenses de base.',
    });
  }

  // Clamp score between 10 and 100
  const finalScore = Math.max(10, Math.min(100, Math.round(score)));

  // Calculate grade
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'B';
  if (finalScore >= 90) grade = 'A+';
  else if (finalScore >= 80) grade = 'A';
  else if (finalScore >= 65) grade = 'B';
  else if (finalScore >= 50) grade = 'C';
  else grade = 'D';

  const debtToIncomeRatio =
    liquidAssetsMinor > 0 ? Math.round((summary.totalPayableMinor / liquidAssetsMinor) * 100) : 0;
  const savingsRate =
    liquidAssetsMinor > 0 ? Math.round((activeSavingsMinor / liquidAssetsMinor) * 100) : 0;

  return {
    score: finalScore,
    grade,
    debtToIncomeRatio,
    savingsRate,
    safeToSpendRunwayDays: safeToSpend.daysUntilPayday,
    factors,
  };
}
