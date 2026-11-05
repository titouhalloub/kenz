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

export function saveZakatState(state: ZakatState, userId?: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(ZAKAT_STORAGE_KEY, userId), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save zakat state', e);
  }
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return;
  void supabase.from('zakat_settings').upsert({
    user_id: userId,
    nisab_threshold_minor: state.nisabThresholdMinor,
    gold_price_per_gram_minor: state.goldPricePerGramMinor,
    custom_cash_minor: state.customCashMinor,
    custom_savings_minor: state.customSavingsMinor,
    custom_business_goods_minor: state.customBusinessGoodsMinor,
    custom_liabilities_minor: state.customLiabilitiesMinor,
    is_paid: state.isPaid,
    paid_date: state.paidDate || null,
    paid_amount_minor: state.paidAmountMinor ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).then(({ error }) => {
    if (error) console.error('Failed to sync Zakat settings:', error.message);
  });
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
  const supabase = getSupabaseClient();
  if (!supabase || !isUuid(userId)) return;
  const owned = budgets.filter((item) => item.userId === userId && isUuid(item.id));
  if (!owned.length) return;
  void supabase.from('festive_budgets').upsert(owned.map((item) => ({
    id: item.id, user_id: userId, festival_type: item.festivalType, year: item.year,
    target_budget_minor: item.targetBudgetMinor, actual_spent_minor: item.actualSpentMinor,
    currency: item.currency, notes: item.notes || null, is_completed: item.isCompleted,
    updated_at: new Date().toISOString(),
  })), { onConflict: 'id' }).then(({ error }) => {
    if (error) console.error('Failed to sync festive budgets:', error.message);
  });
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
