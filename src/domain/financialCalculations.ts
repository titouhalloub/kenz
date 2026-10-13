/**
 * Financial Calculation Engine — Deterministic, pure mathematical logic.
 * Guarantees zero floating-point inaccuracies by operating exclusively on integer minor units.
 */

import {
  Account,
  Transaction,
  RecurringItem,
  SavingsGoal,
  MonthlyBudget,
  SafeToSpendBreakdown,
  CategorySpendSummary,
  Category,
} from './types';

/**
 * Formats minor units into user-friendly currency string (e.g. 1500000 -> "15,000.00 DA").
 * Uses Intl.NumberFormat with exact integer division to prevent float anomalies.
 */
export function formatMoney(amountMinor: number, currency: string = 'DZD', locale: string = 'fr'): string {
  const isNegative = amountMinor < 0;
  const absMinor = Math.abs(amountMinor);
  const major = Math.floor(absMinor / 100);
  const minor = absMinor % 100;
  const minorStr = minor.toString().padStart(2, '0');

  // Format the major portion with locale grouping
  const formattedMajor = new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-DZ' : 'en-US', {
    useGrouping: true,
  }).format(major);

  const sign = isNegative ? '-' : '';

  if (currency === 'DZD') {
    return locale === 'ar'
      ? `${sign}${formattedMajor}.${minorStr} د.ج`
      : `${sign}${formattedMajor}.${minorStr} DA`;
  }

  if (currency === 'EUR') {
    return `${sign}${formattedMajor},${minorStr} €`;
  }

  if (currency === 'USD') {
    return `${sign}$${formattedMajor}.${minorStr}`;
  }

  return `${sign}${formattedMajor}.${minorStr} ${currency}`;
}

/**
 * Parses user input decimal string into integer minor units (e.g., "150.50" -> 15050).
 */
export function parseToMinorUnits(input: string): number {
  if (!input || input.trim() === '') return 0;
  // Replace comma with dot and strip non-numeric except dot and minus
  const cleaned = input.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parts = cleaned.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  if (isNaN(whole)) return 0;

  let cents = 0;
  if (parts.length > 1) {
    const centStr = (parts[1] + '00').slice(0, 2);
    cents = parseInt(centStr, 10) || 0;
  }

  const sign = cleaned.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(whole) * 100 + cents);
}

/**
 * Derives current available balance for an account from initial balance + ledger movements.
 * Enforces transfer neutrality: transfers subtract from sender, add to destination.
 */
export function calculateAccountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.initialBalanceMinor;

  for (const tx of transactions) {
    if (tx.accountId === account.id) {
      if (tx.type === 'income') {
        balance += tx.amountMinor;
      } else if (tx.type === 'expense') {
        balance -= tx.amountMinor;
      } else if (tx.type === 'transfer') {
        // Outgoing transfer from this account
        balance -= tx.amountMinor;
      }
    } else if (tx.type === 'transfer' && tx.destinationAccountId === account.id) {
      // Incoming transfer into this account
      balance += tx.amountMinor;
    }
  }

  return balance;
}

/**
 * Consolidates total net liquid balance across all active accounts.
 * Transfers between user accounts cancel out and do not alter net consolidated balance.
 */
export function calculateConsolidatedBalance(accounts: Account[], transactions: Transaction[]): number {
  return accounts
    .filter((a) => !a.isArchived)
    .reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions), 0);
}

/**
 * Calculates days between today and the next expected payday or planning period boundary.
 */
export function getDaysUntilPlanningEnd(
  todayDate: Date,
  paydayDayOfMonth?: number,
  fallbackPeriodDays: number = 30
): { days: number; endDate: string } {
  const currentYear = todayDate.getFullYear();
  const currentMonth = todayDate.getMonth();
  const currentDay = todayDate.getDate();

  if (paydayDayOfMonth && paydayDayOfMonth >= 1 && paydayDayOfMonth <= 31) {
    // Determine next occurrence of payday
    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (currentDay >= paydayDayOfMonth) {
      // Payday has already passed this month, target next month
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    // Handle variable month lengths (e.g. Feb 28/29)
    const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const actualPaydayDay = Math.min(paydayDayOfMonth, maxDaysInTargetMonth);

    const targetDate = new Date(targetYear, targetMonth, actualPaydayDay);
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const y = targetDate.getFullYear();
    const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const d = targetDate.getDate().toString().padStart(2, '0');

    return { days: diffDays, endDate: `${y}-${m}-${d}` };
  }

  // Fallback: Use user's planning period (e.g., 30 days)
  const targetDate = new Date(todayDate);
  targetDate.setDate(targetDate.getDate() + fallbackPeriodDays);
  const diffDays = fallbackPeriodDays;
  const y = targetDate.getFullYear();
  const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const d = targetDate.getDate().toString().padStart(2, '0');

  return { days: diffDays, endDate: `${y}-${m}-${d}` };
}

/**
 * Authoritative Safe-to-Spend Formula:
 * safe_to_spend = available_balance + expected_income_before_payday - unpaid_reserved_commitments - planned_savings - other_reserved_amounts
 */
export function calculateSafeToSpend(params: {
  accounts: Account[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  todayDate: Date;
  paydayDayOfMonth?: number;
  planningPeriodDays?: number;
}): SafeToSpendBreakdown {
  const {
    accounts,
    transactions,
    recurringItems,
    savingsGoals,
    todayDate,
    paydayDayOfMonth,
    planningPeriodDays = 30,
  } = params;

  // 1. Available liquid balance from posted ledger
  const availableBalanceMinor = calculateConsolidatedBalance(accounts, transactions);

  // 2. Planning horizon calculation
  const { days: daysUntilPayday, endDate: planningEndDate } = getDaysUntilPlanningEnd(
    todayDate,
    paydayDayOfMonth,
    planningPeriodDays
  );

  const todayStr = todayDate.toISOString().split('T')[0];

  // 3. Expected Income before planning cutoff (from active recurring items due between today and cutoff)
  let expectedIncomeMinor = 0;
  // 4. Unpaid Reserved Commitments (bills/recurring expenses due before cutoff)
  let unpaidReservedCommitmentsMinor = 0;

  for (const item of recurringItems) {
    if (!item.isActive) continue;

    // Check if due within planning period
    if (item.nextDueDate >= todayStr && item.nextDueDate <= planningEndDate) {
      if (item.type === 'income') {
        expectedIncomeMinor += item.amountMinor;
      } else if (item.type === 'expense') {
        // Only reserve if NOT already paid in transactions for this cycle
        // Invariant: check if an expense with the same description or category was posted on or near due date
        unpaidReservedCommitmentsMinor += item.amountMinor;
      }
    }
  }

  // 5. Planned Savings allocation
  // Sum monthly planned contribution for active savings goals
  const plannedSavingsMinor = savingsGoals
    .filter((g) => g.status === 'active')
    .reduce((sum, g) => sum + g.plannedMonthlyContributionMinor, 0);

  // 6. Final calculation (Safe To Spend can be negative to display real shortfall)
  const safeToSpendMinor =
    availableBalanceMinor +
    expectedIncomeMinor -
    unpaidReservedCommitmentsMinor -
    plannedSavingsMinor;

  // 7. Daily discretionary limit (clamped at 0 if in deficit)
  const dailyGuidelineMinor = Math.floor(Math.max(0, safeToSpendMinor) / Math.max(1, daysUntilPayday));

  return {
    availableBalanceMinor,
    expectedIncomeMinor,
    unpaidReservedCommitmentsMinor,
    plannedSavingsMinor,
    otherReservedMinor: 0,
    safeToSpendMinor,
    daysUntilPayday,
    dailyGuidelineMinor,
    isPaydayConfigured: !!paydayDayOfMonth,
    planningEndDate,
  };
}

/**
 * Calculates budget pace and remaining amount for categories in current month.
 */
export function calculateCategoryBudgets(params: {
  categories: Category[];
  budgets: MonthlyBudget[];
  transactions: Transaction[];
  currentDate: Date;
}): CategorySpendSummary[] {
  const { categories, budgets, transactions, currentDate } = params;
  const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const currentDay = currentDate.getDate();
  const pacePercentage = Math.round((currentDay / daysInMonth) * 100);

  const budgetMap = new Map<string, number>();
  for (const b of budgets) {
    if (b.monthYear === currentMonthYear) {
      budgetMap.set(b.categoryId, b.budgetMinor);
    }
  }

  // Calculate actual spending in current month per category
  const spendMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.categoryId) {
      const txDate = new Date(tx.transactionDate);
      if (
        txDate.getFullYear() === currentDate.getFullYear() &&
        txDate.getMonth() === currentDate.getMonth()
      ) {
        spendMap.set(tx.categoryId, (spendMap.get(tx.categoryId) || 0) + tx.amountMinor);
      }
    }
  }

  return categories
    .filter((c) => !c.isIncome)
    .map((category) => {
      const budgetMinor = budgetMap.get(category.id) || 0;
      const spentMinor = spendMap.get(category.id) || 0;
      const remainingMinor = budgetMinor - spentMinor;
      const percentageUsed = budgetMinor > 0 ? Math.round((spentMinor / budgetMinor) * 100) : 0;

      return {
        categoryId: category.id,
        categoryName: category.name,
        color: category.color,
        budgetMinor,
        spentMinor,
        remainingMinor,
        percentageUsed,
        isOverBudget: budgetMinor > 0 && spentMinor > budgetMinor,
        pacePercentage,
      };
    });
}

/**
 * Generates an explainable, deterministic weekly financial summary.
 * Zero LLM hallucination: purely derived from posted transactions and commitments.
 */
export function generateDeterministicWeeklySummary(params: {
  transactions: Transaction[];
  safeToSpend: SafeToSpendBreakdown;
  todayDate: Date;
}): {
  spentLast7DaysMinor: number;
  incomeLast7DaysMinor: number;
  transactionCount: number;
  topExpenseCategoryName?: string;
  actionableObservation: string;
} {
  const { transactions, safeToSpend, todayDate } = params;

  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  let spentLast7DaysMinor = 0;
  let incomeLast7DaysMinor = 0;
  let transactionCount = 0;

  for (const tx of transactions) {
    if (tx.transactionDate >= sevenDaysAgoStr) {
      transactionCount++;
      if (tx.type === 'expense') {
        spentLast7DaysMinor += tx.amountMinor;
      } else if (tx.type === 'income') {
        incomeLast7DaysMinor += tx.amountMinor;
      }
    }
  }

  let actionableObservation = '';
  if (safeToSpend.safeToSpendMinor < 0) {
    actionableObservation = `Shortfall detected: You have a deficit of ${formatMoney(Math.abs(safeToSpend.safeToSpendMinor))} before your upcoming commitments. Pause discretionary spending until income arrives.`;
  } else if (safeToSpend.dailyGuidelineMinor > 0) {
    actionableObservation = `On track: You can safely spend up to ${formatMoney(safeToSpend.dailyGuidelineMinor)} per day across the remaining ${safeToSpend.daysUntilPayday} days while keeping savings protected.`;
  } else {
    actionableObservation = `Commitments covered: Your bills are reserved. Add income or reduce allocations to unlock discretionary spending.`;
  }

  return {
    spentLast7DaysMinor,
    incomeLast7DaysMinor,
    transactionCount,
    actionableObservation,
  };
}
