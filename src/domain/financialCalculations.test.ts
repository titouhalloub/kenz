import { describe, it, expect } from 'vitest';
import {
  calculateAccountBalance,
  calculateConsolidatedBalance,
  calculateSafeToSpend,
  formatMoney,
  parseToMinorUnits,
} from './financialCalculations';
import { Account, Transaction, RecurringItem, SavingsGoal } from './types';

describe('Financial Calculations Engine', () => {
  const dummyAccount1: Account = {
    id: 'acc-1',
    userId: 'user-1',
    name: 'Cash Wallet',
    type: 'cash',
    currency: 'DZD',
    initialBalanceMinor: 1000000, // 10,000.00 DZD
    isArchived: false,
  };

  const dummyAccount2: Account = {
    id: 'acc-2',
    userId: 'user-1',
    name: 'CCP Bank',
    type: 'bank',
    currency: 'DZD',
    initialBalanceMinor: 5000000, // 50,000.00 DZD
    isArchived: false,
  };

  it('correctly updates account balances for income and expenses', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        userId: 'user-1',
        accountId: 'acc-1',
        type: 'income',
        amountMinor: 200000, // +2,000.00 DZD
        currency: 'DZD',
        transactionDate: '2026-10-01',
        createdAt: '2026-10-01T10:00:00Z',
      },
      {
        id: 'tx-2',
        userId: 'user-1',
        accountId: 'acc-1',
        type: 'expense',
        amountMinor: 50000, // -500.00 DZD
        currency: 'DZD',
        transactionDate: '2026-10-02',
        createdAt: '2026-10-02T10:00:00Z',
      },
    ];

    const balance1 = calculateAccountBalance(dummyAccount1, transactions);
    // 10,000 + 2,000 - 500 = 11,500.00 DZD = 1,150,000 minor units
    expect(balance1).toBe(1150000);
  });

  it('guarantees transfer neutrality: transfers adjust accounts but preserve net consolidated balance', () => {
    // Transfer 30,000.00 DZD (3,000,000 minor) from Bank (acc-2) to Cash (acc-1)
    const transferTx: Transaction[] = [
      {
        id: 'tx-transfer',
        userId: 'user-1',
        accountId: 'acc-2',
        destinationAccountId: 'acc-1',
        type: 'transfer',
        amountMinor: 3000000,
        currency: 'DZD',
        transactionDate: '2026-10-05',
        createdAt: '2026-10-05T10:00:00Z',
      },
    ];

    const bal1 = calculateAccountBalance(dummyAccount1, transferTx);
    const bal2 = calculateAccountBalance(dummyAccount2, transferTx);

    // Cash received 30,000 -> 10,000 + 30,000 = 40,000.00 DZD
    expect(bal1).toBe(4000000);
    // Bank sent 30,000 -> 50,000 - 30,000 = 20,000.00 DZD
    expect(bal2).toBe(2000000);

    // Consolidated total before transfer: 60,000.00 DZD (6,000,000 minor)
    // Consolidated total after transfer: must remain exactly 60,000.00 DZD (6,000,000 minor)
    const netConsolidated = calculateConsolidatedBalance([dummyAccount1, dummyAccount2], transferTx);
    expect(netConsolidated).toBe(6000000);
  });

  it('calculates safe-to-spend accurately with bills and planned savings', () => {
    const today = new Date('2026-10-13');
    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-1',
        userId: 'user-1',
        name: 'Internet Bill',
        type: 'expense',
        amountMinor: 250000, // 2,500.00 DZD
        currency: 'DZD',
        frequency: 'monthly',
        nextDueDate: '2026-10-20',
        isActive: true,
      },
    ];

    const savingsGoals: SavingsGoal[] = [
      {
        id: 'goal-1',
        userId: 'user-1',
        name: 'Emergency Fund',
        targetAmountMinor: 10000000,
        currentAmountMinor: 2000000,
        plannedMonthlyContributionMinor: 1000000, // 10,000.00 DZD
        currency: 'DZD',
        status: 'active',
      },
    ];

    // Total available: 60,000.00 DZD (acc1 + acc2 = 6,000,000 minor)
    // Reserved bill: 2,500.00 DZD (250,000 minor)
    // Planned savings: 10,000.00 DZD (1,000,000 minor)
    // Safe-to-spend = 60,000 - 2,500 - 10,000 = 47,500.00 DZD = 4,750,000 minor
    const result = calculateSafeToSpend({
      accounts: [dummyAccount1, dummyAccount2],
      transactions: [],
      recurringItems,
      savingsGoals,
      todayDate: today,
      paydayDayOfMonth: 28, // Payday on 28th (15 days away)
    });

    expect(result.availableBalanceMinor).toBe(6000000);
    expect(result.unpaidReservedCommitmentsMinor).toBe(250000);
    expect(result.plannedSavingsMinor).toBe(1000000);
    expect(result.safeToSpendMinor).toBe(4750000);
    expect(result.daysUntilPayday).toBe(15);
    // Daily limit: 4,750,000 / 15 = 316,666 minor (~3,166.66 DZD)
    expect(result.dailyGuidelineMinor).toBe(316666);
  });

  it('handles negative safe-to-spend without silent clamping in calculation', () => {
    const today = new Date('2026-10-13');
    // Low account balance: 500.00 DZD (50,000 minor)
    const lowAccount: Account = {
      ...dummyAccount1,
      initialBalanceMinor: 50000,
    };

    const bigBill: RecurringItem = {
      id: 'bill-rent',
      userId: 'user-1',
      name: 'Rent',
      type: 'expense',
      amountMinor: 2000000, // 20,000.00 DZD
      currency: 'DZD',
      frequency: 'monthly',
      nextDueDate: '2026-10-18',
      isActive: true,
    };

    const result = calculateSafeToSpend({
      accounts: [lowAccount],
      transactions: [],
      recurringItems: [bigBill],
      savingsGoals: [],
      todayDate: today,
      paydayDayOfMonth: 25,
    });

    // Shortfall: 500 - 20,000 = -19,500.00 DZD (-1,950,000 minor)
    expect(result.safeToSpendMinor).toBe(-1950000);
    // Daily guideline must clamp at 0 so user is not prompted to spend negative money
    expect(result.dailyGuidelineMinor).toBe(0);
  });

  it('formats minor units accurately without float artifacts', () => {
    expect(formatMoney(1250000, 'DZD', 'fr')).toBe('12 500.00 DA');
    expect(formatMoney(-50050, 'DZD', 'fr')).toBe('-500.50 DA');
    expect(parseToMinorUnits('150.50')).toBe(15050);
    expect(parseToMinorUnits('15000')).toBe(1500000);
  });
});
