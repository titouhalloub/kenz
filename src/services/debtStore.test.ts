import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDebtState,
  saveDebtState,
  addDebtEntry,
  recordDebtPayment,
  deleteDebtEntry,
  calculateDebtSummary,
  calculateFinancialHealthScore,
  mergeDebtSnapshots,
  resolveUnappliedDebtPayment,
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
      expectedIncomeMinor: 0,
      unpaidReservedCommitmentsMinor: 2000000,
      plannedSavingsMinor: 1000000,
      otherReservedMinor: 0,
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


  it('merges concurrent device payments once and recalculates the remaining balance', () => {
    const base = sampleDebts[0];
    const deviceA: DebtEntry = {
      ...base,
      updatedAt: '2026-10-12T10:00:00Z',
      payments: [{ id: 'payment_a', debtId: base.id, amountMinor: 120000, paymentDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z' }],
    };
    const deviceB: DebtEntry = {
      ...base,
      updatedAt: '2026-10-12T11:00:00Z',
      payments: [{ id: 'payment_b', debtId: base.id, amountMinor: 80000, paymentDate: '2026-10-12', createdAt: '2026-10-12T11:00:00Z' }],
    };

    const merged = mergeDebtSnapshots([deviceA], [deviceB])[0];
    expect(merged.payments).toHaveLength(2);
    expect(merged.remainingAmountMinor).toBe(300000);
    expect(merged.status).toBe('partially_paid');
  });

  it('flags excess concurrent offline payments instead of applying more than the debt total', () => {
    const base = sampleDebts[0];
    const earlierPayment: DebtEntry = {
      ...base,
      updatedAt: '2026-10-12T10:00:00Z',
      payments: [{
        id: 'payment_earlier',
        debtId: base.id,
        amountMinor: 300000,
        paymentDate: '2026-10-12',
        createdAt: '2026-10-12T10:00:00Z',
      }],
    };
    const laterPayment: DebtEntry = {
      ...base,
      updatedAt: '2026-10-12T11:00:00Z',
      payments: [{
        id: 'payment_later',
        debtId: base.id,
        amountMinor: 300000,
        paymentDate: '2026-10-12',
        createdAt: '2026-10-12T11:00:00Z',
      }],
    };

    const merged = mergeDebtSnapshots([laterPayment], [earlierPayment])[0];
    const earlier = merged.payments.find((payment) => payment.id === 'payment_earlier')!;
    const later = merged.payments.find((payment) => payment.id === 'payment_later')!;

    expect(merged.remainingAmountMinor).toBe(0);
    expect(merged.status).toBe('settled');
    expect(earlier.appliedAmountMinor).toBe(300000);
    expect(earlier.unappliedAmountMinor).toBe(0);
    expect(later.appliedAmountMinor).toBe(200000);
    expect(later.unappliedAmountMinor).toBe(100000);
    expect(later.reconciliationStatus).toBe('partial');
  });

  it('allocates concurrent payment events identically regardless of device merge order', () => {
    const base = sampleDebts[0];
    const first: DebtEntry = {
      ...base,
      payments: [{
        id: 'payment_first', debtId: base.id, amountMinor: 300000,
        paymentDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z',
      }],
    };
    const second: DebtEntry = {
      ...base,
      payments: [{
        id: 'payment_second', debtId: base.id, amountMinor: 300000,
        paymentDate: '2026-10-12', createdAt: '2026-10-12T11:00:00Z',
      }],
    };

    const mergeAB = mergeDebtSnapshots([first], [second])[0];
    const mergeBA = mergeDebtSnapshots([second], [first])[0];
    const allocations = (debt: DebtEntry) => debt.payments
      .map((payment) => [payment.id, payment.appliedAmountMinor, payment.unappliedAmountMinor])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    expect(allocations(mergeAB)).toEqual(allocations(mergeBA));
  });

  it('recalculates refunded payments using their net amount and excludes confirmed duplicates', () => {
    const base = sampleDebts[0];
    const debt: DebtEntry = {
      ...base,
      payments: [
        { id: 'payment_refund', debtId: base.id, amountMinor: 200000, refundedAmountMinor: 50000, resolutionStatus: 'partially_refunded', paymentDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z' },
        { id: 'payment_duplicate', debtId: base.id, amountMinor: 100000, duplicateOfPaymentId: 'payment_refund', resolutionStatus: 'duplicate', paymentDate: '2026-10-12', createdAt: '2026-10-12T11:00:00Z' },
      ],
    };
    const normalized = mergeDebtSnapshots([debt], [])[0];
    const refunded = normalized.payments.find((payment) => payment.id === 'payment_refund')!;
    const duplicate = normalized.payments.find((payment) => payment.id === 'payment_duplicate')!;
    expect(refunded.appliedAmountMinor).toBe(150000);
    expect(refunded.unappliedAmountMinor).toBe(0);
    expect(duplicate.appliedAmountMinor).toBe(0);
    expect(duplicate.unappliedAmountMinor).toBe(0);
    expect(normalized.remainingAmountMinor).toBe(350000);
  });

  it('rejects reconciliation when the debt is not in the authenticated snapshot', async () => {
    await expect(
      resolveUnappliedDebtPayment([], '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003')
    ).rejects.toThrow('Debt or payment not found or access denied');
  });

  it('deduplicates the same payment event synced from two devices', () => {
    const base = sampleDebts[0];
    const samePayment = {
      id: 'shared_payment_id',
      debtId: base.id,
      amountMinor: 125000,
      paymentDate: '2026-10-12',
      createdAt: '2026-10-12T10:00:00Z',
    };
    const deviceA: DebtEntry = { ...base, payments: [samePayment] };
    const deviceB: DebtEntry = { ...base, payments: [{ ...samePayment }] };

    const merged = mergeDebtSnapshots([deviceA], [deviceB])[0];
    expect(merged.payments).toHaveLength(1);
    expect(merged.remainingAmountMinor).toBe(375000);
  });

  it('uses the newest debt details while retaining payment events from both devices', () => {
    const base = sampleDebts[0];
    const local: DebtEntry = {
      ...base,
      counterpartyName: 'Local edit',
      updatedAt: '2026-10-12T10:00:00Z',
      payments: [{ id: 'payment_local', debtId: base.id, amountMinor: 50000, paymentDate: '2026-10-12', createdAt: '2026-10-12T10:00:00Z' }],
    };
    const remote: DebtEntry = {
      ...base,
      counterpartyName: 'Cloud edit',
      updatedAt: '2026-10-12T12:00:00Z',
      payments: [{ id: 'payment_remote', debtId: base.id, amountMinor: 75000, paymentDate: '2026-10-12', createdAt: '2026-10-12T12:00:00Z' }],
    };

    const merged = mergeDebtSnapshots([local], [remote])[0];
    expect(merged.counterpartyName).toBe('Cloud edit');
    expect(merged.payments.map((payment) => payment.id).sort()).toEqual(['payment_local', 'payment_remote']);
    expect(merged.remainingAmountMinor).toBe(375000);
  });

  it('keeps locally deleted debt IDs out of the merged snapshot', () => {
    const merged = mergeDebtSnapshots(sampleDebts, sampleDebts, ['debt_1']);
    expect(merged.map((debt) => debt.id)).toEqual(['debt_2']);
  });

  it('deletes a debt entry correctly', () => {
    const afterDelete = deleteDebtEntry(sampleDebts, 'debt_1');
    expect(afterDelete.length).toBe(1);
    expect(afterDelete.find((d) => d.id === 'debt_1')).toBeUndefined();
  });
});
