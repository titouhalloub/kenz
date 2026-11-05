import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyBudgetState,
  flushPendingBudgetSync,
  loadBudgetState,
  saveBudgetState,
  wipeAllLocalData,
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
