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
const OUTBOX_VERSION = 1;

interface DebtOutbox {
  version: number;
  debts: DebtEntry[];
  deletedDebtIds: string[];
  updatedAt: string;
}

function debtOutboxKey(userId: string): string {
  return `kenz_debt_outbox_v${OUTBOX_VERSION}_${userId}`;
}

function readDebtOutbox(userId: string): DebtOutbox | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(debtOutboxKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as DebtOutbox;
    return value && value.version === OUTBOX_VERSION && Array.isArray(value.debts) &&
      Array.isArray(value.deletedDebtIds) ? value : null;
  } catch {
    return null;
  }
}

function writeDebtOutbox(userId: string, outbox: DebtOutbox): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(debtOutboxKey(userId), JSON.stringify(outbox));
}

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
  await flushPendingDebtSync(userId);
  // Never replace the local snapshot with stale cloud data while an outbox remains pending.
  if (readDebtOutbox(userId)) return loadDebtState(userId);
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
      appliedAmountMinor: Number(row.applied_amount_minor ?? row.amount_minor),
      unappliedAmountMinor: Number(row.unapplied_amount_minor ?? 0),
      reconciliationStatus: row.reconciliation_status || 'applied',
      refundedAmountMinor: Number(row.refunded_amount_minor ?? 0),
      duplicateOfPaymentId: row.duplicate_of_payment_id || undefined,
      resolutionStatus: row.resolution_status || 'normal',
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

export function mergeDebtSnapshots(localDebts: DebtEntry[], remoteDebts: DebtEntry[], deletedIds: string[] = []): DebtEntry[] {
  const deleted = new Set(deletedIds);
  const merged = new Map<string, DebtEntry>();
  for (const debt of remoteDebts) if (!deleted.has(debt.id)) merged.set(debt.id, debt);
  for (const local of localDebts) {
    if (deleted.has(local.id)) continue;
    const remote = merged.get(local.id);
    if (!remote) { merged.set(local.id, local); continue; }
    const localIsNewer = Date.parse(local.updatedAt || local.createdAt) > Date.parse(remote.updatedAt || remote.createdAt);
    const preferred = localIsNewer ? local : remote;
    const payments = new Map<string, DebtPayment>();
    for (const payment of [...(remote.payments || []), ...(local.payments || [])]) {
      if (!payments.has(payment.id)) payments.set(payment.id, payment);
    }
    // Allocate payment events in a stable chronological order. Any amount above
    // the debt total stays visible as unapplied instead of silently reducing the
    // balance or disappearing when two offline devices reconnect.
    let availableToApply = preferred.totalAmountMinor;
    const allPayments = [...payments.values()]
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) ||
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((payment) => {
        const effectiveAmountMinor = payment.resolutionStatus === 'duplicate'
          ? 0
          : Math.max(0, payment.amountMinor - (payment.refundedAmountMinor || 0));
        const appliedAmountMinor = Math.min(effectiveAmountMinor, Math.max(0, availableToApply));
        availableToApply -= appliedAmountMinor;
        const unappliedAmountMinor = effectiveAmountMinor - appliedAmountMinor;
        return {
          ...payment,
          appliedAmountMinor,
          unappliedAmountMinor,
          reconciliationStatus: unappliedAmountMinor === 0
            ? 'applied' as const
            : appliedAmountMinor > 0 ? 'partial' as const : 'pending' as const,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const paidMinor = allPayments.reduce((sum, payment) => sum + (payment.appliedAmountMinor || 0), 0);
    const remainingAmountMinor = Math.max(0, preferred.totalAmountMinor - paidMinor);
    merged.set(local.id, {
      ...preferred,
      payments: allPayments,
      remainingAmountMinor,
      status: remainingAmountMinor === 0 ? 'settled' : paidMinor > 0 ? 'partially_paid' : 'active',
      updatedAt: localIsNewer ? local.updatedAt : remote.updatedAt,
    });
  }
  // Normalize every entry, including debts that exist on only one device.
  // The ordering matches the database allocator: payment date, creation time, ID.
  for (const [id, debt] of merged) {
    let availableToApply = debt.totalAmountMinor;
    const payments = [...(debt.payments || [])]
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) ||
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((payment) => {
        const effectiveAmountMinor = payment.resolutionStatus === 'duplicate'
          ? 0
          : Math.max(0, payment.amountMinor - (payment.refundedAmountMinor || 0));
        const appliedAmountMinor = Math.min(effectiveAmountMinor, Math.max(0, availableToApply));
        availableToApply -= appliedAmountMinor;
        const unappliedAmountMinor = effectiveAmountMinor - appliedAmountMinor;
        return {
          ...payment,
          appliedAmountMinor,
          unappliedAmountMinor,
          reconciliationStatus: unappliedAmountMinor === 0
            ? 'applied' as const
            : appliedAmountMinor > 0 ? 'partial' as const : 'pending' as const,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const appliedTotal = payments.reduce((sum, payment) => sum + (payment.appliedAmountMinor || 0), 0);
    const remainingAmountMinor = Math.max(0, debt.totalAmountMinor - appliedTotal);
    merged.set(id, {
      ...debt,
      payments,
      remainingAmountMinor,
      status: remainingAmountMinor === 0 ? 'settled' : appliedTotal > 0 ? 'partially_paid' : 'active',
    });
  }

  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Replay durable Kredy edits before cloud hydration. Payment events are merged by ID;
 * concurrent edits to debt details use updatedAt last-write-wins. */
export async function flushPendingDebtSync(userId: string): Promise<void> {
  if (!isUuid(userId)) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  let newerSnapshotArrived = false;
  debtCloudSyncQueue = debtCloudSyncQueue.then(async () => {
    const pending = readDebtOutbox(userId);
    const { data: tombstoneRows, error: tombstoneError } = await supabase
      .from('debt_sync_tombstones').select('debt_id').eq('user_id', userId);
    if (tombstoneError) throw tombstoneError;
    const cloudDeletedIds = (tombstoneRows || []).map((row) => row.debt_id as string);
    const deletedIds = [...new Set([...(pending?.deletedDebtIds || []), ...cloudDeletedIds])];
    if (pending && pending.deletedDebtIds.length > 0) {
      const { error } = await supabase.from('debt_sync_tombstones').upsert(
        pending.deletedDebtIds.map((debtId) => ({ debt_id: debtId, user_id: userId })),
        { onConflict: 'debt_id' },
      );
      if (error) throw error;
    }
    const { data: debtRows, error: debtError } = await supabase.from('debts').select('*').eq('user_id', userId);
    if (debtError) throw debtError;
    const remoteIds = (debtRows || []).map((row) => row.id as string);
    let paymentRows: Record<string, any>[] = [];
    if (remoteIds.length) {
      const { data, error } = await supabase.from('debt_payments').select('*').in('debt_id', remoteIds);
      if (error) throw error;
      paymentRows = (data || []) as Record<string, any>[];
    }
    const paymentsByDebt = new Map<string, DebtPayment[]>();
    for (const row of paymentRows) {
      const payment: DebtPayment = {
        id: row.id, debtId: row.debt_id, amountMinor: Number(row.amount_minor),
        appliedAmountMinor: Number(row.applied_amount_minor ?? row.amount_minor),
        unappliedAmountMinor: Number(row.unapplied_amount_minor ?? 0),
        reconciliationStatus: row.reconciliation_status || 'applied',
        refundedAmountMinor: Number(row.refunded_amount_minor ?? 0),
        duplicateOfPaymentId: row.duplicate_of_payment_id || undefined,
        resolutionStatus: row.resolution_status || 'normal',
        paymentDate: row.payment_date, sourceAccountId: row.source_account_id || undefined,
        notes: row.notes || undefined, createdAt: row.created_at,
      };
      paymentsByDebt.set(payment.debtId, [...(paymentsByDebt.get(payment.debtId) || []), payment]);
    }
    const remoteDebts: DebtEntry[] = (debtRows || []).map((row) => ({
      id: row.id, userId: row.user_id, businessId: row.business_id || undefined,
      counterpartyName: row.counterparty_name, counterpartyPhone: row.counterparty_phone || undefined,
      type: row.type, totalAmountMinor: Number(row.total_amount_minor),
      remainingAmountMinor: Number(row.remaining_amount_minor), currency: row.currency,
      dueDate: row.due_date || undefined, notes: row.notes || undefined, status: row.status,
      payments: paymentsByDebt.get(row.id) || [], createdAt: row.created_at, updatedAt: row.updated_at,
    }));

    if (deletedIds.length) {
      const { error } = await supabase.from('debts').delete().eq('user_id', userId).in('id', deletedIds);
      if (error) throw error;
    }
    // Even without a local outbox, enforce cloud tombstones to clean up a stale
    // row that raced with another device's delete operation.
    if (!pending) return;
    const merged = mergeDebtSnapshots(pending.debts, remoteDebts, deletedIds);
    const owned = merged.filter((debt) => debt.userId === userId && isUuid(debt.id));
    if (owned.length) {
      const { error } = await supabase.from('debts').upsert(owned.map((d) => ({
        id: d.id, user_id: userId, business_id: d.businessId && isUuid(d.businessId) ? d.businessId : null,
        counterparty_name: d.counterpartyName, counterparty_phone: d.counterpartyPhone || null,
        type: d.type, total_amount_minor: d.totalAmountMinor,
        remaining_amount_minor: d.remainingAmountMinor, currency: d.currency,
        due_date: d.dueDate || null, notes: d.notes || null, status: d.status,
        created_at: d.createdAt, updated_at: d.updatedAt,
      })), { onConflict: 'id' });
      if (error) throw error;
    }
    const mergedPayments = owned.flatMap((d) => d.payments.filter((p) => isUuid(p.id)).map((p) => ({
      debtId: d.id,
      id: p.id,
      amountMinor: p.amountMinor,
      paymentDate: p.paymentDate,
      sourceAccountId: p.sourceAccountId && isUuid(p.sourceAccountId) ? p.sourceAccountId : null,
      notes: p.notes || null,
      createdAt: p.createdAt,
    }))).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) ||
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

    // The database locks the debt row and reallocates every event in chronological
    // order. This makes simultaneous offline payments deterministic and idempotent.
    for (const payment of mergedPayments) {
      const { error } = await supabase.rpc('record_kredy_payment', {
        p_payment_id: payment.id,
        p_debt_id: payment.debtId,
        p_amount_minor: payment.amountMinor,
        p_payment_date: payment.paymentDate,
        p_created_at: payment.createdAt,
        p_source_account_id: payment.sourceAccountId,
        p_notes: payment.notes,
      });
      if (error) throw error;
    }

    const syncedDebtIds = owned.map((debt) => debt.id);
    let finalDebtRows: Record<string, any>[] = [];
    let finalPaymentRows: Record<string, any>[] = [];
    if (syncedDebtIds.length) {
      const [{ data: debtData, error: finalDebtError }, { data: paymentData, error: finalPaymentError }] =
        await Promise.all([
          supabase.from('debts').select('*').eq('user_id', userId).in('id', syncedDebtIds),
          supabase.from('debt_payments').select('*').in('debt_id', syncedDebtIds),
        ]);
      if (finalDebtError) throw finalDebtError;
      if (finalPaymentError) throw finalPaymentError;
      finalDebtRows = (debtData || []) as Record<string, any>[];
      finalPaymentRows = (paymentData || []) as Record<string, any>[];
    }
    const finalDebtById = new Map(finalDebtRows.map((row) => [row.id as string, row]));
    const finalPaymentsByDebt = new Map<string, DebtPayment[]>();
    for (const row of finalPaymentRows) {
      const payment: DebtPayment = {
        id: row.id, debtId: row.debt_id, amountMinor: Number(row.amount_minor),
        appliedAmountMinor: Number(row.applied_amount_minor),
        unappliedAmountMinor: Number(row.unapplied_amount_minor),
        reconciliationStatus: row.reconciliation_status,
        refundedAmountMinor: Number(row.refunded_amount_minor ?? 0),
        duplicateOfPaymentId: row.duplicate_of_payment_id || undefined,
        resolutionStatus: row.resolution_status || 'normal',
        paymentDate: row.payment_date, sourceAccountId: row.source_account_id || undefined,
        notes: row.notes || undefined, createdAt: row.created_at,
      };
      finalPaymentsByDebt.set(payment.debtId, [...(finalPaymentsByDebt.get(payment.debtId) || []), payment]);
    }
    const syncedDebts = owned.map((debt) => {
      const row = finalDebtById.get(debt.id);
      return {
        ...debt,
        remainingAmountMinor: row ? Number(row.remaining_amount_minor) : debt.remainingAmountMinor,
        status: row?.status || debt.status,
        updatedAt: row?.updated_at || debt.updatedAt,
        payments: finalPaymentsByDebt.get(debt.id) || debt.payments,
      };
    });
    const syncedById = new Map(syncedDebts.map((debt) => [debt.id, debt]));
    const finalSnapshot = merged.map((debt) => syncedById.get(debt.id) || debt);

    if (typeof localStorage !== 'undefined') localStorage.setItem(localDebtKey(userId), JSON.stringify(finalSnapshot));
    const latest = readDebtOutbox(userId);
    if (latest && JSON.stringify(latest) === JSON.stringify(pending)) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(debtOutboxKey(userId));
    } else if (latest) {
      // Replay edits that arrived while this batch was syncing.
      newerSnapshotArrived = true;
      return;
    }
  }).catch((error) => {
    console.error('Kredy outbox sync failed; edits remain queued:', error);
  });
  await debtCloudSyncQueue;
  if (newerSnapshotArrived) await flushPendingDebtSync(userId);
}

/** Persist locally first, then durably queue every authenticated user's change. */
export function saveDebtState(debts: DebtEntry[], ownerId?: string, deletedDebtIds: string[] = []): void {
  const userId = ownerId || debts[0]?.userId;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(localDebtKey(userId), JSON.stringify(debts));
  } catch (err) {
    console.error('Failed to save debts to localStorage:', err);
  }
  if (!userId || !isUuid(userId)) return;
  const previous = readDebtOutbox(userId);
  const outbox: DebtOutbox = {
    version: OUTBOX_VERSION,
    debts: debts.filter((debt) => debt.userId === userId),
    deletedDebtIds: [...new Set([...(previous?.deletedDebtIds || []), ...deletedDebtIds])],
    updatedAt: new Date().toISOString(),
  };
  try {
    writeDebtOutbox(userId, outbox);
  } catch (error) {
    console.error('Failed to persist Kredy outbox:', error);
    return;
  }
  void flushPendingDebtSync(userId);
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
  saveDebtState(next, entry.userId);
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
  if (paymentAmount <= 0) return { nextDebts: debts, payment: null };
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
  saveDebtState(nextDebts, current.userId);

  return { nextDebts, payment };
}

/**
 * Atomically reconcile an unapplied payment after explicit user confirmation.
 * The server locks the debt row, checks the displayed amount is still current,
 * increases the recorded debt total, and re-runs chronological allocation.
 */
export async function resolveUnappliedDebtPayment(
  debts: DebtEntry[],
  debtId: string,
  paymentId: string,
  userId: string,
): Promise<DebtEntry[]> {
  const debt = debts.find((item) => item.id === debtId);
  if (!debt || debt.userId !== userId || !isUuid(userId) || !isUuid(debtId) || !isUuid(paymentId)) {
    throw new Error('Debt or payment not found or access denied');
  }

  const payment = debt.payments.find((item) => item.id === paymentId);
  const expectedUnappliedMinor = payment?.unappliedAmountMinor || 0;
  if (!payment || expectedUnappliedMinor <= 0) {
    throw new Error('This payment has no unapplied amount to reconcile');
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('A secure connection is required to reconcile this payment');

  // Drain this device's durable edits first. Never apply a server-side adjustment
  // while an older local snapshot could still overwrite the debt total.
  await flushPendingDebtSync(userId);
  if (readDebtOutbox(userId)) {
    throw new Error('Kredy sync is still pending. Reconnect and try again.');
  }

  const { error } = await supabase.rpc('resolve_kredy_unapplied_payment', {
    p_payment_id: paymentId,
    p_expected_unapplied_minor: expectedUnappliedMinor,
  });
  if (error) throw new Error(error.message);

  const refreshed = await loadDebtStateFromSupabase(userId);
  if (!refreshed) throw new Error('The payment was reconciled, but the latest balance could not be refreshed');
  return refreshed;
}

/**
 * Record a partial/full refund or confirm a duplicate payment.
 * The server keeps the original event immutable and recalculates allocations atomically.
 */
export async function resolveKredyPaymentIssue(
  debts: DebtEntry[],
  debtId: string,
  paymentId: string,
  userId: string,
  action: 'duplicate' | 'refund',
  refundAmountMinor?: number,
  duplicateOfPaymentId?: string,
): Promise<DebtEntry[]> {
  const debt = debts.find((item) => item.id === debtId);
  if (!debt || debt.userId !== userId || !isUuid(userId) || !isUuid(debtId) || !isUuid(paymentId)) {
    throw new Error('Debt or payment not found or access denied');
  }
  const payment = debt.payments.find((item) => item.id === paymentId);
  if (!payment) throw new Error('Payment not found');
  const paymentResolution = payment.resolutionStatus || 'normal';
  if (action === 'refund' && !['normal', 'partially_refunded'].includes(paymentResolution)) {
    throw new Error('This payment cannot receive another refund');
  }
  if (action === 'duplicate' && paymentResolution !== 'normal') {
    throw new Error('Only an unresolved payment can be marked as a duplicate');
  }
  if (action === 'refund') {
    const remainingRefundable = payment.amountMinor - (payment.refundedAmountMinor || 0);
    if (!Number.isSafeInteger(refundAmountMinor) || !refundAmountMinor || refundAmountMinor <= 0 || refundAmountMinor > remainingRefundable) {
      throw new Error('Refund amount must be positive and no greater than the unrefunded payment amount');
    }
  } else {
    const original = debt.payments.find((item) => item.id === duplicateOfPaymentId);
    if (!duplicateOfPaymentId || duplicateOfPaymentId === paymentId || !isUuid(duplicateOfPaymentId) ||
      !original || (original.resolutionStatus || 'normal') === 'duplicate') {
      throw new Error('Select a valid original payment from this debt');
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('A secure connection is required to resolve this payment');
  await flushPendingDebtSync(userId);
  if (readDebtOutbox(userId)) throw new Error('Kredy sync is still pending. Reconnect and try again.');

  const { error } = await supabase.rpc('resolve_kredy_payment_issue', {
    p_payment_id: paymentId,
    p_action: action,
    p_refund_amount_minor: action === 'refund' ? refundAmountMinor : null,
    p_duplicate_of_payment_id: action === 'duplicate' ? duplicateOfPaymentId : null,
  });
  if (error) throw new Error(error.message);

  const refreshed = await loadDebtStateFromSupabase(userId);
  if (!refreshed) throw new Error('The payment was updated, but the latest balance could not be refreshed');
  return refreshed;
}

/**
 * Deletes a debt entry.
 */
export function deleteDebtEntry(debts: DebtEntry[], debtId: string): DebtEntry[] {
  const target = debts.find((d) => d.id === debtId);
  const next = debts.filter((d) => d.id !== debtId);
  saveDebtState(next, target?.userId, target ? [debtId] : []);
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
