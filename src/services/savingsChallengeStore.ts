import { SavingsChallengeContribution } from '../domain/types';
import { getSupabaseClient } from './supabase';
import { flushPendingBudgetSync } from './budgetStore';

const STORAGE_PREFIX = 'kenz_savings_challenge_contributions_v1_';
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function storageKey(userId: string) { return STORAGE_PREFIX + userId; }

function persist(userId: string, rows: SavingsChallengeContribution[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey(userId), JSON.stringify(rows)); }
  catch (error) { console.error('Unable to persist savings challenge contributions:', error); }
}

export function loadSavingsChallengeContributions(userId: string): SavingsChallengeContribution[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function loadSavingsChallengeContributionsFromSupabase(userId: string): Promise<SavingsChallengeContribution[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return null;
  const { data, error } = await supabase
    .from('savings_challenge_contributions')
    .select('*')
    .eq('user_id', userId)
    .order('contribution_date', { ascending: false });
  if (error) {
    console.error('Unable to load savings challenge contributions:', error.message);
    return null;
  }
  const localRows = loadSavingsChallengeContributions(userId);
  const cloudRows: SavingsChallengeContribution[] = (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    savingsGoalId: row.savings_goal_id,
    amountMinor: Number(row.amount_minor),
    contributionDate: row.contribution_date,
    note: row.note || undefined,
    createdAt: row.created_at,
    syncStatus: 'synced',
  }));
  const byId = new Map(cloudRows.map((row) => [row.id, row]));
  for (const row of localRows) if (!byId.has(row.id)) byId.set(row.id, row);
  const merged = [...byId.values()].sort((a, b) => b.contributionDate.localeCompare(a.contributionDate) || b.createdAt.localeCompare(a.createdAt));
  persist(userId, merged);
  return merged;
}

export async function flushPendingSavingsChallengeContributions(userId: string): Promise<boolean> {
  if (!isUuid(userId) || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
  const budgetSynced = await flushPendingBudgetSync(userId);
  if (!budgetSynced) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const rows = loadSavingsChallengeContributions(userId);
  let allSucceeded = true;
  for (const row of rows.filter((item) => item.syncStatus === 'pending')) {
    const { error } = await supabase.rpc('record_kenz_savings_challenge_contribution', {
      p_id: row.id,
      p_goal_id: row.savingsGoalId,
      p_amount_minor: row.amountMinor,
      p_contribution_date: row.contributionDate,
      p_note: row.note || null,
    });
    if (error) {
      allSucceeded = false;
      console.error('Savings challenge contribution sync failed:', error.message);
      break;
    }
    row.syncStatus = 'synced';
  }
  persist(userId, rows);
  return allSucceeded;
}

export function addSavingsChallengeContribution(
  userId: string,
  savingsGoalId: string,
  amountMinor: number,
  contributionDate: string,
  note?: string,
): SavingsChallengeContribution[] {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return loadSavingsChallengeContributions(userId);
  const rows = loadSavingsChallengeContributions(userId);
  const row: SavingsChallengeContribution = {
    id: createId(),
    userId,
    savingsGoalId,
    amountMinor,
    contributionDate,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    syncStatus: isUuid(userId) ? 'pending' : 'synced',
  };
  const next = [row, ...rows];
  persist(userId, next);
  if (isUuid(userId)) void flushPendingSavingsChallengeContributions(userId);
  return next;
}

export function retrySavingsChallengeSync(userId: string): void {
  void flushPendingSavingsChallengeContributions(userId);
}
