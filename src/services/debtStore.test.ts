import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDebtState,
  saveDebtState,
  addDebtEntry,
  recordDebtPayment,
  deleteDebtEntry,
  calculateDebtSummary,
  calculateFinancialHealthScore,
} from './debtStore';
import { DebtEntry, SafeToSpendBreakdown, Account, SavingsGoal } from '../domain/types';

describe('Phase 5 Debt Store & Financial Health Engine', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  const sampleDebts: DebtEntry[] = [
    {
      id: 'debt_1',
      userId: 'usr_test',
      counterpartyName: 'Épicerie du Coin',
      type: 'payable',
      totalAmountMinor: 500000, // 5,000 DA
      remainingAmountMinor: 500000,
      currency: 'DZD',
      dueDate: '2026-10-30',
      status: 'active',
      payments: [],
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'debt_2',
      userId: 'usr_test',
      counterpartyName: 'Ami Omar',
      type: 'receivable',
      totalAmountMinor: 800000, // 8,000 DA
      remainingAmountMinor: 800000,
      currency: 'DZD',
      dueDate: '2026-10-10', // Overdue relative to 2026-10-13
      status: 'active',
      payments: [],
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('loads initial baseline debts when storage is empty', () => {
    const debts = loadDebtState();
    expect(debts.length).toBeGreaterThanOrEqual(2);
    expect(debts[0].counterpartyName).toBeDefined();
  });

  it('adds a new debt entry with initial active status', () => {
    const next = addDebtEntry([], {
      userId: 'usr_test',
      counterpartyName: 'Quincaillerie Centrale',
      type: 'payable',
      totalAmountMinor: 350000,
      currency: 'DZD',
      dueDate: '2026-10-25',
      notes: 'Matériel plomberie',
    });

    expect(next.length).toBe(1);
    expect(next[0].counterpartyName).toBe('Quincaillerie Centrale');
    expect(next[0].remainingAmountMinor).toBe(350000);
    expect(next[0].status).toBe('active');
  });

  it('records a partial payment on a debt and transitions status to partially_paid', () => {
    const { nextDebts, payment } = recordDebtPayment(sampleDebts, {
      debtId: 'debt_1',
      amountMinor: 200000, // Pay 2,000 DA
      notes: 'Premier acompte',
    });

    expect(payment).not.toBeNull();
    expect(payment?.amountMinor).toBe(200000);

    const updated = nextDebts.find((d) => d.id === 'debt_1')!;
    expect(updated.remainingAmountMinor).toBe(300000); // 5,000 - 2,000 = 3,000 DA
    expect(updated.status).toBe('partially_paid');
    expect(updated.payments.length).toBe(1);
  });

  it('settles a debt completely when full amount is paid', () => {
    const { nextDebts } = recordDebtPayment(sampleDebts, {
      debtId: 'debt_1',
      amountMinor: 500000, // Pay full 5,000 DA
    });

    const updated = nextDebts.find((d) => d.id === 'debt_1')!;
    expect(updated.remainingAmountMinor).toBe(0);
    expect(updated.status).toBe('settled');
  });

  it('calculates debt summary with overdue tracking', () => {
    const summary = calculateDebtSummary(sampleDebts, new Date('2026-10-13'));

    expect(summary.totalPayableMinor).toBe(500000); // 5,000 DA
    expect(summary.totalReceivableMinor).toBe(800000); // 8,000 DA
    expect(summary.netDebtMinor).toBe(300000); // +3,000 DA
    expect(summary.overdueCount).toBe(1); // Omar is overdue (2026-10-10 < 2026-10-13)
  });

  it('computes deterministic Financial Health Score', () => {
    const mockSafeToSpend: SafeToSpendBreakdown = {
      availableBalanceMinor: 9000000, // 90,000 DA
      unpaidReservedCommitmentsMinor: 2000000,
      plannedSavingsMinor: 1000000,
      safeToSpendMinor: 6000000, // 60,000 DA safe
      daysUntilPayday: 15,
      dailyGuidelineMinor: 400000,
      isPaydayConfigured: true,
      planningEndDate: '2026-10-28',
    };

    const mockAccounts: Account[] = [
      {
        id: 'acc_1',
        userId: 'usr_test',
        name: 'CCP',
        type: 'bank',
        currency: 'DZD',
        initialBalanceMinor: 9000000,
        isArchived: false,
      },
    ];

    const mockGoals: SavingsGoal[] = [
      {
        id: 'g_1',
        userId: 'usr_test',
        name: 'Urgence',
        targetAmountMinor: 10000000,
        currentAmountMinor: 6000000,
        plannedMonthlyContributionMinor: 1000000,
        currency: 'DZD',
        status: 'active',
      },
    ];

    const health = calculateFinancialHealthScore({
      safeToSpend: mockSafeToSpend,
      accounts: mockAccounts,
      transactions: [],
      savingsGoals: mockGoals,
      debts: sampleDebts,
    });

    expect(health.score).toBeGreaterThanOrEqual(70);
    expect(['A+', 'A', 'B']).toContain(health.grade);
    expect(health.factors.length).toBeGreaterThan(0);
  });

  it('deletes a debt entry correctly', () => {
    const afterDelete = deleteDebtEntry(sampleDebts, 'debt_1');
    expect(afterDelete.length).toBe(1);
    expect(afterDelete.find((d) => d.id === 'debt_1')).toBeUndefined();
  });
});
