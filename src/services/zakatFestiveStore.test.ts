import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ZAKAT_STATE,
  INITIAL_FESTIVE_BUDGETS,
  loadFestiveState,
  loadZakatState,
  saveFestiveState,
  saveZakatState,
  mergeFestiveRows,
  mergeZakatFields,
  FestiveBudget,
  ZakatState,
} from './zakatFestiveStore';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const storage = new Map<string, string>();

describe('Zakat and festive budget persistence', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
    });
  });

  it('preserves independent Zakat edits made on separate devices', () => {
    const base = { ...EMPTY_ZAKAT_STATE };
    const local = { ...base, customCashMinor: 250000 };
    const remote = { ...base, customSavingsMinor: 500000 };
    const merged = mergeZakatFields(local, remote, base, '2026-11-05T10:00:00Z', '2026-11-05T11:00:00Z');
    expect(merged.customCashMinor).toBe(250000);
    expect(merged.customSavingsMinor).toBe(500000);
  });

  it('uses the newest timestamp for a same-field Zakat conflict', () => {
    const base = { ...EMPTY_ZAKAT_STATE };
    const local = { ...base, customCashMinor: 300000 };
    const remote = { ...base, customCashMinor: 200000 };
    const merged = mergeZakatFields(local, remote, base, '2026-11-05T12:00:00Z', '2026-11-05T11:00:00Z');
    expect(merged.customCashMinor).toBe(300000);
  });

  it('merges independent festive edits and respects explicit deletion tombstones', () => {
    const base: FestiveBudget = {
      id: '55555555-5555-4555-8555-555555555555',
      userId: userA, festivalType: 'ramadan', year: 2027,
      targetBudgetMinor: 100000, actualSpentMinor: 10000,
      currency: 'DZD', isCompleted: false,
    };
    const local = [{ ...base, notes: 'Phone note' }];
    const remote = [{ ...base, actualSpentMinor: 25000, syncUpdatedAt: '2026-11-05T11:00:00Z' }];
    const merged = mergeFestiveRows(local, remote, [base], [], '2026-11-05T10:00:00Z');
    expect(merged[0].notes).toBe('Phone note');
    expect(merged[0].actualSpentMinor).toBe(25000);
    expect(mergeFestiveRows([], remote, [base], [base.id], '2026-11-05T12:00:00Z')).toEqual([]);
  });

  it('does not seed authenticated users with demo Zakat assets', () => {
    expect(loadZakatState(userA)).toEqual(EMPTY_ZAKAT_STATE);
    expect(loadFestiveState(userA)).toEqual([]);
  });

  it('keeps Zakat settings isolated between authenticated users', () => {
    const state: ZakatState = {
      ...EMPTY_ZAKAT_STATE,
      customCashMinor: 125000,
      customSavingsMinor: 300000,
    };
    saveZakatState(state, userA);

    expect(loadZakatState(userA)).toEqual(state);
    expect(loadZakatState(userB)).toEqual(EMPTY_ZAKAT_STATE);
  });

  it('keeps festive budgets isolated and preserves demo fixtures only for local mode', () => {
    const budget = {
      id: '33333333-3333-4333-8333-333333333333',
      userId: userA,
      festivalType: 'ramadan' as const,
      year: 2027,
      targetBudgetMinor: 500000,
      actualSpentMinor: 125000,
      currency: 'DZD',
      isCompleted: false,
    };
    saveFestiveState([budget], userA);

    expect(loadFestiveState(userA)).toEqual([budget]);
    expect(loadFestiveState(userB)).toEqual([]);
    expect(loadFestiveState()).toEqual(INITIAL_FESTIVE_BUDGETS);
  });
});
