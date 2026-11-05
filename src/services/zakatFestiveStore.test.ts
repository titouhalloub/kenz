import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_ZAKAT_STATE,
  INITIAL_FESTIVE_BUDGETS,
  loadFestiveState,
  loadZakatState,
  saveFestiveState,
  saveZakatState,
  ZakatState,
} from './zakatFestiveStore';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

describe('Zakat and festive budget persistence', () => {
  beforeEach(() => {
    localStorage.clear();
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
