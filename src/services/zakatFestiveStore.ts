/**
 * Phase 6 — Zakat, Sadaka and Festive Budgeting Service (Ramadan & Aid)
 */

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

export function loadZakatState(): ZakatState {
  try {
    const raw = localStorage.getItem(ZAKAT_STORAGE_KEY);
    if (!raw) return INITIAL_ZAKAT_STATE;
    return JSON.parse(raw);
  } catch {
    return INITIAL_ZAKAT_STATE;
  }
}

export function saveZakatState(state: ZakatState): void {
  try {
    localStorage.setItem(ZAKAT_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save zakat state', e);
  }
}

export function loadFestiveState(): FestiveBudget[] {
  try {
    const raw = localStorage.getItem(FESTIVE_STORAGE_KEY);
    if (!raw) return INITIAL_FESTIVE_BUDGETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_FESTIVE_BUDGETS;
  } catch {
    return INITIAL_FESTIVE_BUDGETS;
  }
}

export function saveFestiveState(budgets: FestiveBudget[]): void {
  try {
    localStorage.setItem(FESTIVE_STORAGE_KEY, JSON.stringify(budgets));
  } catch (e) {
    console.error('Failed to save festive budgets', e);
  }
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
