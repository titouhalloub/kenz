import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyBudgetState,
  flushPendingBudgetSync,
  loadBudgetState,
  saveBudgetState,
  wipeAllLocalData,
  mergeBudgetSnapshots,
} from './budgetStore';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const storage = new Map<string, string>();

const profile = (id: string) => ({
  id,
  email: `${id}@example.test`,
  displayName: 'Test account',
  preferredCurrency: 'DZD',
  locale: 'fr' as const,
  planningPeriodDays: 30,
});

describe('budget offline persistence', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
      get length() { return storage.size; },
      key: (index: number) => [...storage.keys()][index] ?? null,
    });
    vi.stubGlobal('navigator', { onLine: false });
  });

  it('starts authenticated accounts with empty financial records', () => {
    const state = loadBudgetState(profile(userA));
    expect(state.accounts).toEqual([]);
    expect(state.transactions).toEqual([]);
    expect(state.budgets).toEqual([]);
  });

  it('isolates local financial caches by authenticated user', () => {
    const state = createEmptyBudgetState(profile(userA));
    state.profile.displayName = 'Account A';
    saveBudgetState(state);

    expect(loadBudgetState(profile(userA)).profile.displayName).toBe('Account A');
    expect(loadBudgetState(profile(userB)).accounts).toEqual([]);
    expect(loadBudgetState(profile(userB)).transactions).toEqual([]);
  });

  it('merges independent edits to the same account from separate devices', () => {
    const base = createEmptyBudgetState(profile(userA));
    const account = {
      id: '33333333-3333-4333-8333-333333333333', userId: userA,
      name: 'Cash', type: 'cash' as const, currency: 'DZD',
      initialBalanceMinor: 100000, isArchived: false,
    };
    base.accounts = [account];
    const local = { ...base, accounts: [{ ...account, name: 'Cash phone' }] };
    const remote = { ...base, accounts: [{ ...account, isArchived: true, syncUpdatedAt: '2026-11-05T11:00:00.000Z' }] };
    const merged = mergeBudgetSnapshots(local, remote, base,
      { transactions: [], recurringItems: [], budgets: [], savingsGoals: [], accounts: [] },
      '2026-11-05T10:00:00.000Z');
    expect(merged.accounts[0].name).toBe('Cash phone');
    expect(merged.accounts[0].isArchived).toBe(true);
  });

  it('uses the newest device timestamp for a same-field conflict', () => {
    const base = createEmptyBudgetState(profile(userA));
    const account = {
      id: '44444444-4444-4444-8444-444444444444', userId: userA,
      name: 'Cash', type: 'cash' as const, currency: 'DZD',
      initialBalanceMinor: 100000, isArchived: false,
    };
    base.accounts = [account];
    const local = { ...base, accounts: [{ ...account, name: 'Phone name' }] };
    const remote = { ...base, accounts: [{ ...account, name: 'Tablet name', syncUpdatedAt: '2026-11-05T11:00:00.000Z' }] };
    const merged = mergeBudgetSnapshots(local, remote, base,
      { transactions: [], recurringItems: [], budgets: [], savingsGoals: [], accounts: [] },
      '2026-11-05T12:00:00.000Z');
    expect(merged.accounts[0].name).toBe('Phone name');
  });

  it('keeps a durable snapshot queued while offline and clears it on local wipe', async () => {
    const state = createEmptyBudgetState(profile(userA));
    saveBudgetState(state);

    const outboxKey = `kenz_budget_outbox_v1_${userA}`;
    expect(storage.has(outboxKey)).toBe(true);
    await expect(flushPendingBudgetSync(userA)).resolves.toBe(false);
    expect(storage.has(outboxKey)).toBe(true);

    wipeAllLocalData();
    expect(storage.has(outboxKey)).toBe(false);
    expect(storage.has(`kenz_budget_state_v1_${userA}`)).toBe(false);
  });
});
