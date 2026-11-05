/**
 * Phase 6 — Zakat, Sadaka and Festive Budgeting Service (Ramadan & Aid)
 * User-scoped local caches with authenticated Supabase persistence.
 */

import { getSupabaseClient } from './supabase';

export interface ZakatState {
  nisabThresholdMinor: number; // e.g. 95000000 centimes (950,000 DZD)
  goldPricePerGramMinor: number; // e.g. 11500 DZD
  customCashMinor: number;
  customSavingsMinor: number;
  customBusinessGoodsMinor: number;
  customLiabilitiesMinor: number;
  isPaid: boolean;
  paidDate?: string;
  paidAmountMinor?: number;
}

export interface FestiveBudget {
  id: string;
  userId: string;
  festivalType: 'ramadan' | 'aid_adha' | 'aid_fitr';
  year: number;
  targetBudgetMinor: number;
  actualSpentMinor: number;
  currency: string;
  notes?: string;
  isCompleted: boolean;
  syncUpdatedAt?: string;
}

const ZAKAT_STORAGE_KEY = 'kenz_zakat_state_v1';
const FESTIVE_STORAGE_KEY = 'kenz_festive_state_v1';

function isUuid(value?: string): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function scopedKey(key: string, userId?: string): string {
  return isUuid(userId) ? `${key}_${userId}` : key;
}

export const EMPTY_ZAKAT_STATE: ZakatState = {
  nisabThresholdMinor: 95000000,
  goldPricePerGramMinor: 1150000,
  customCashMinor: 0,
  customSavingsMinor: 0,
  customBusinessGoodsMinor: 0,
  customLiabilitiesMinor: 0,
  isPaid: false,
};

export const INITIAL_ZAKAT_STATE: ZakatState = {
  nisabThresholdMinor: 95000000, // 950,000 DZD in minor units (or cents)
  goldPricePerGramMinor: 1150000, // 11,500 DZD
  customCashMinor: 12500000, // 125,000 DZD
  customSavingsMinor: 45000000, // 450,000 DZD
  customBusinessGoodsMinor: 30000000, // 300,000 DZD
  customLiabilitiesMinor: 15000000, // 150,000 DZD
  isPaid: false,
};

export const INITIAL_FESTIVE_BUDGETS: FestiveBudget[] = [
  {
    id: 'fest_ramadan_2026',
    userId: 'usr_local_1',
    festivalType: 'ramadan',
    year: 2026,
    targetBudgetMinor: 6000000, // 60,000 DZD
    actualSpentMinor: 4500000,
    currency: 'DZD',
    notes: 'Provision courses ftour, zlabia, dates, et Zakat al-Fitr',
    isCompleted: false,
  },
  {
    id: 'fest_adha_2026',
    userId: 'usr_local_1',
    festivalType: 'aid_adha',
    year: 2026,
    targetBudgetMinor: 7500000, // 75,000 DZD
    actualSpentMinor: 0,
    currency: 'DZD',
    notes: 'Achat mouton de lAïd + frais boucher et épices',
    isCompleted: false,
  },
];

export function loadZakatState(userId?: string): ZakatState {
  const key = scopedKey(ZAKAT_STORAGE_KEY, userId);
  const fallback = isUuid(userId) ? EMPTY_ZAKAT_STATE : INITIAL_ZAKAT_STATE;
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

const PENDING_ZAKAT_PREFIX = 'kenz_zakat_outbox_v2_';
const PENDING_FESTIVE_PREFIX = 'kenz_festive_outbox_v2_';

function writePendingSnapshot(key: string, value: unknown): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.error('Unable to persist Zakat/Festive offline outbox:', error); }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function mergeZakatFields(local: ZakatState, remote: ZakatState, base: ZakatState, localStamp: string, remoteStamp: string): ZakatState {
  const merged = { ...remote };
  for (const key of Object.keys(base) as Array<keyof ZakatState>) {
    const localChanged = !valuesEqual(local[key], base[key]);
    const remoteChanged = !valuesEqual(remote[key], base[key]);
    if (localChanged && !remoteChanged) (merged as any)[key] = local[key];
    else if (localChanged && remoteChanged && valuesEqual(local[key], remote[key])) (merged as any)[key] = local[key];
    else if (localChanged && remoteChanged) {
      if ((Date.parse(localStamp) || 0) > (Date.parse(remoteStamp) || 0)) (merged as any)[key] = local[key];
      else if ((Date.parse(localStamp) || 0) === (Date.parse(remoteStamp) || 0) &&
        JSON.stringify(local[key]) > JSON.stringify(remote[key])) (merged as any)[key] = local[key];
    }
  }
  return merged;
}

function mergeFestiveRows(
  local: FestiveBudget[], remote: FestiveBudget[], base: FestiveBudget[],
  deletedIds: string[], localStamp: string,
): FestiveBudget[] {
  const lm = new Map(local.map((row) => [row.id, row]));
  const rm = new Map(remote.map((row) => [row.id, row]));
  const bm = new Map(base.map((row) => [row.id, row]));
  const removed = new Set(deletedIds);
  const result: FestiveBudget[] = [];
  for (const id of new Set([...lm.keys(), ...rm.keys()])) {
    if (removed.has(id)) continue;
    const l = lm.get(id), r = rm.get(id), b = bm.get(id);
    if (l && r) {
      if (!b) { result.push((Date.parse(localStamp) > Date.parse(r.syncUpdatedAt || '') ? { ...r, ...l } : { ...l, ...r })); continue; }
      const merged = { ...r };
      for (const key of Object.keys(b) as Array<keyof FestiveBudget>) {
        if (key === 'syncUpdatedAt') continue;
        const lc = !valuesEqual(l[key], b[key]), rc = !valuesEqual(r[key], b[key]);
        if (lc && !rc) (merged as any)[key] = l[key];
        else if (lc && rc && valuesEqual(l[key], r[key])) (merged as any)[key] = l[key];
        else if (lc && rc && (Date.parse(localStamp) || 0) > (Date.parse(r.syncUpdatedAt || '') || 0)) (merged as any)[key] = l[key];
      }
      result.push(merged);
    } else if (l && (!b || !valuesEqual(l, b))) result.push(l);
    else if (r) result.push(r);
  }
  return result;
}

async function flushSnapshot(key: string, userId: string, table: 'zakat_settings' | 'festive_budgets'): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId) || typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(key);
  if (!raw) return true;
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return false; }
  const localStamp = payload?.updatedAt || new Date(0).toISOString();

  if (table === 'zakat_settings') {
    const local: ZakatState = payload?.state || payload;
    const base: ZakatState = payload?.baseState || EMPTY_ZAKAT_STATE;
    const { data: row, error: readError } = await supabase.from(table).select('*').eq('user_id', userId).maybeSingle();
    if (readError) return false;
    const remote: ZakatState = row ? {
      nisabThresholdMinor: Number(row.nisab_threshold_minor),
      goldPricePerGramMinor: Number(row.gold_price_per_gram_minor),
      customCashMinor: Number(row.custom_cash_minor),
      customSavingsMinor: Number(row.custom_savings_minor),
      customBusinessGoodsMinor: Number(row.custom_business_goods_minor),
      customLiabilitiesMinor: Number(row.custom_liabilities_minor),
      isPaid: Boolean(row.is_paid), paidDate: row.paid_date || undefined,
      paidAmountMinor: row.paid_amount_minor == null ? undefined : Number(row.paid_amount_minor),
    } : EMPTY_ZAKAT_STATE;
    const merged = mergeZakatFields(local, remote, base, localStamp, row?.updated_at || '');
    const result = await supabase.from(table).upsert({
      user_id: userId, nisab_threshold_minor: merged.nisabThresholdMinor,
      gold_price_per_gram_minor: merged.goldPricePerGramMinor, custom_cash_minor: merged.customCashMinor,
      custom_savings_minor: merged.customSavingsMinor, custom_business_goods_minor: merged.customBusinessGoodsMinor,
      custom_liabilities_minor: merged.customLiabilitiesMinor, is_paid: merged.isPaid,
      paid_date: merged.paidDate || null, paid_amount_minor: merged.paidAmountMinor ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (result.error) { console.error('Failed to sync Zakat outbox:', result.error.message); return false; }
    if (localStorage.getItem(key) === raw) localStorage.setItem(scopedKey(ZAKAT_STORAGE_KEY, userId), JSON.stringify(merged));
  } else {
    const local: FestiveBudget[] = Array.isArray(payload) ? payload : payload?.state || [];
    const base: FestiveBudget[] = payload?.baseState || [];
    const { data: rows, error: readError } = await supabase.from(table).select('*').eq('user_id', userId);
    if (readError) return false;
    const remote: FestiveBudget[] = (rows || []).map((row) => ({
      id: row.id, userId: row.user_id, festivalType: row.festival_type, year: row.year,
      targetBudgetMinor: Number(row.target_budget_minor), actualSpentMinor: Number(row.actual_spent_minor),
      currency: row.currency, notes: row.notes || undefined, isCompleted: Boolean(row.is_completed),
      syncUpdatedAt: row.updated_at || row.created_at,
    }));
    const deletedIds = [
      ...(payload?.deletedIds || []),
      ...base.filter((item) => !local.some((next) => next.id === item.id)).map((item) => item.id),
    ];
    const merged = mergeFestiveRows(local, remote, base, [...new Set(deletedIds)], localStamp)
      .filter((item) => item.userId === userId && isUuid(item.id));
    const removed = [...new Set(deletedIds)].filter(isUuid);
    if (removed.length) {
      const deleted = await supabase.from(table).delete().in('id', removed).eq('user_id', userId);
      if (deleted.error) return false;
    }
    if (merged.length) {
      const result = await supabase.from(table).upsert(merged.map((item) => ({
        id: item.id, user_id: userId, festival_type: item.festivalType, year: item.year,
        target_budget_minor: item.targetBudgetMinor, actual_spent_minor: item.actualSpentMinor,
        currency: item.currency, notes: item.notes || null, is_completed: item.isCompleted,
        updated_at: new Date().toISOString(),
      })), { onConflict: 'id' });
      if (result.error) { console.error('Failed to sync festive outbox:', result.error.message); return false; }
    }
    if (localStorage.getItem(key) === raw) localStorage.setItem(scopedKey(FESTIVE_STORAGE_KEY, userId), JSON.stringify(merged));
  }
  if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
  return true;
}

/** Replay durable Zakat and festive snapshots after app restart or reconnect. */
export async function flushPendingZakatFestiveSync(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const zakatOk = await flushSnapshot(PENDING_ZAKAT_PREFIX + userId, userId, 'zakat_settings');
  const festiveOk = await flushSnapshot(PENDING_FESTIVE_PREFIX + userId, userId, 'festive_budgets');
  return zakatOk && festiveOk;
}

export function saveZakatState(state: ZakatState, userId?: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(ZAKAT_STORAGE_KEY, userId), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save zakat state', e);
  }
  if (!isUuid(userId)) return;
  writePendingSnapshot(PENDING_ZAKAT_PREFIX + userId, state);
  void flushPendingZakatFestiveSync(userId);
}

export async function loadZakatStateFromSupabase(userId: string): Promise<ZakatState | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId) return null;
  const { data, error } = await supabase.from('zakat_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('Failed to load Zakat settings:', error.message);
    return null;
  }
  const state: ZakatState = data ? {
    nisabThresholdMinor: Number(data.nisab_threshold_minor),
    goldPricePerGramMinor: Number(data.gold_price_per_gram_minor),
    customCashMinor: Number(data.custom_cash_minor),
    customSavingsMinor: Number(data.custom_savings_minor),
    customBusinessGoodsMinor: Number(data.custom_business_goods_minor),
    customLiabilitiesMinor: Number(data.custom_liabilities_minor),
    isPaid: Boolean(data.is_paid),
    paidDate: data.paid_date || undefined,
    paidAmountMinor: data.paid_amount_minor == null ? undefined : Number(data.paid_amount_minor),
  } : EMPTY_ZAKAT_STATE;
  if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(ZAKAT_STORAGE_KEY, userId), JSON.stringify(state));
  return state;
}

export function loadFestiveState(userId?: string): FestiveBudget[] {
  const fallback = isUuid(userId) ? [] : INITIAL_FESTIVE_BUDGETS;
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(scopedKey(FESTIVE_STORAGE_KEY, userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveFestiveState(budgets: FestiveBudget[], userId?: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(FESTIVE_STORAGE_KEY, userId), JSON.stringify(budgets));
  } catch (e) {
    console.error('Failed to save festive budgets', e);
  }
  if (!isUuid(userId)) return;
  writePendingSnapshot(PENDING_FESTIVE_PREFIX + userId, budgets);
  void flushPendingZakatFestiveSync(userId);
}

export async function loadFestiveStateFromSupabase(userId: string): Promise<FestiveBudget[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId) return null;
  const { data, error } = await supabase.from('festive_budgets').select('*').eq('user_id', userId).order('year', { ascending: false });
  if (error) {
    console.error('Failed to load festive budgets:', error.message);
    return null;
  }
  const budgets: FestiveBudget[] = (data || []).map((row) => ({
    id: row.id, userId: row.user_id, festivalType: row.festival_type,
    year: row.year, targetBudgetMinor: Number(row.target_budget_minor),
    actualSpentMinor: Number(row.actual_spent_minor), currency: row.currency,
    notes: row.notes || undefined, isCompleted: Boolean(row.is_completed),
  }));
  if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(FESTIVE_STORAGE_KEY, userId), JSON.stringify(budgets));
  return budgets;
}

export interface ZakatSummary {
  totalAssetsMinor: number;
  netWealthMinor: number;
  nisabThresholdMinor: number;
  isEligible: boolean;
  zakatDueMinor: number;
}

export function calculateZakatSummary(state: ZakatState): ZakatSummary {
  const totalAssetsMinor =
    state.customCashMinor + state.customSavingsMinor + state.customBusinessGoodsMinor;
  const netWealthMinor = Math.max(0, totalAssetsMinor - state.customLiabilitiesMinor);
  const isEligible = netWealthMinor >= state.nisabThresholdMinor;
  const zakatDueMinor = isEligible ? Math.round(netWealthMinor * 0.025) : 0;

  return {
    totalAssetsMinor,
    netWealthMinor,
    nisabThresholdMinor: state.nisabThresholdMinor,
    isEligible,
    zakatDueMinor,
  };
}
