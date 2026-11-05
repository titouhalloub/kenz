/**
 * Financial Calculation Engine — Deterministic, pure mathematical logic.
 * Monetary amounts are integer minor units to avoid floating-point drift.
 */
import {
  Account, Transaction, RecurringItem, SavingsGoal, MonthlyBudget,
  SafeToSpendBreakdown, CategorySpendSummary, Category,
} from './types';

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeDescription(value?: string): string {
  return (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Legacy transactions do not store a recurring-item ID. Until they do, only
 * treat a bill as paid when description, amount, currency and a narrow date
 * window all match. This intentionally avoids category-only false positives.
 */
function isRecurringExpensePaid(
  item: RecurringItem,
  transactions: Transaction[],
  todayStr: string,
): boolean {
  const dueDate = parseLocalDate(item.nextDueDate);
  const windowStart = new Date(dueDate);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowEnd = new Date(dueDate);
  windowEnd.setDate(windowEnd.getDate() + 7);
  const startStr = toLocalDateString(windowStart);
  const endStr = [toLocalDateString(windowEnd), todayStr].sort()[0];
  const recurringName = normalizeDescription(item.name);

  return transactions.some((tx) =>
    tx.type === 'expense' &&
    tx.userId === item.userId &&
    tx.currency === item.currency &&
    tx.amountMinor === item.amountMinor &&
    normalizeDescription(tx.description) === recurringName &&
    tx.transactionDate >= startStr &&
    tx.transactionDate <= endStr
  );
}

export function formatMoney(amountMinor: number, currency: string = 'DZD', locale: string = 'fr'): string {
  const isNegative = amountMinor < 0;
  const absMinor = Math.abs(amountMinor);
  const major = Math.floor(absMinor / 100);
  const minor = absMinor % 100;
  const minorStr = minor.toString().padStart(2, '0');
  const formattedMajor = new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-DZ' : 'en-US', {
    useGrouping: true,
  }).format(major);
  const sign = isNegative ? '-' : '';
  if (currency === 'DZD') return locale === 'ar' ? `${sign}${formattedMajor}.${minorStr} د.ج` : `${sign}${formattedMajor}.${minorStr} DA`;
  if (currency === 'EUR') return `${sign}${formattedMajor},${minorStr} €`;
  if (currency === 'USD') return `${sign}$${formattedMajor}.${minorStr}`;
  return `${sign}${formattedMajor}.${minorStr} ${currency}`;
}

export function parseToMinorUnits(input: string): number {
  if (!input || input.trim() === '') return 0;
  const cleaned = input.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parts = cleaned.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  if (isNaN(whole)) return 0;
  let cents = 0;
  if (parts.length > 1) cents = parseInt((parts[1] + '00').slice(0, 2), 10) || 0;
  const sign = cleaned.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(whole) * 100 + cents);
}

export function calculateAccountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.initialBalanceMinor;
  for (const tx of transactions) {
    if (tx.accountId === account.id) {
      if (tx.type === 'income') balance += tx.amountMinor;
      else if (tx.type === 'expense' || tx.type === 'transfer') balance -= tx.amountMinor;
    } else if (tx.type === 'transfer' && tx.destinationAccountId === account.id) {
      balance += tx.amountMinor;
    }
  }
  return balance;
}

export function calculateConsolidatedBalance(accounts: Account[], transactions: Transaction[]): number {
  return accounts.filter((a) => !a.isArchived)
    .reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions), 0);
}

export function getDaysUntilPlanningEnd(
  todayDate: Date,
  paydayDayOfMonth?: number,
  fallbackPeriodDays: number = 30
): { days: number; endDate: string } {
  const currentYear = todayDate.getFullYear();
  const currentMonth = todayDate.getMonth();
  const currentDay = todayDate.getDate();
  if (paydayDayOfMonth && paydayDayOfMonth >= 1 && paydayDayOfMonth <= 31) {
    let targetYear = currentYear;
    let targetMonth = currentMonth;
    if (currentDay >= paydayDayOfMonth) {
      targetMonth += 1;
      if (targetMonth > 11) { targetMonth = 0; targetYear += 1; }
    }
    const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDate = new Date(targetYear, targetMonth, Math.min(paydayDayOfMonth, maxDaysInTargetMonth));
    const diffDays = Math.max(1, Math.ceil((targetDate.getTime() - todayDate.getTime()) / 86400000));
    return { days: diffDays, endDate: toLocalDateString(targetDate) };
  }
  const targetDate = new Date(todayDate);
  targetDate.setDate(targetDate.getDate() + fallbackPeriodDays);
  return { days: fallbackPeriodDays, endDate: toLocalDateString(targetDate) };
}

export function calculateSafeToSpend(params: {
  accounts: Account[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  todayDate: Date;
  paydayDayOfMonth?: number;
  planningPeriodDays?: number;
}): SafeToSpendBreakdown {
  const { accounts, transactions, recurringItems, savingsGoals, todayDate, paydayDayOfMonth, planningPeriodDays = 30 } = params;
  const availableBalanceMinor = calculateConsolidatedBalance(accounts, transactions);
  const { days: daysUntilPayday, endDate: planningEndDate } = getDaysUntilPlanningEnd(todayDate, paydayDayOfMonth, planningPeriodDays);
  const todayStr = toLocalDateString(todayDate);
  let expectedIncomeMinor = 0;
  let unpaidReservedCommitmentsMinor = 0;

  for (const item of recurringItems) {
    if (!item.isActive || item.nextDueDate < todayStr || item.nextDueDate > planningEndDate) continue;
    if (item.type === 'income') expectedIncomeMinor += item.amountMinor;
    else if (!isRecurringExpensePaid(item, transactions, todayStr)) unpaidReservedCommitmentsMinor += item.amountMinor;
  }

  const plannedSavingsMinor = savingsGoals
    .filter((g) => g.status === 'active')
    .reduce((sum, g) => sum + g.plannedMonthlyContributionMinor, 0);
  const safeToSpendMinor = availableBalanceMinor + expectedIncomeMinor - unpaidReservedCommitmentsMinor - plannedSavingsMinor;
  const dailyGuidelineMinor = Math.floor(Math.max(0, safeToSpendMinor) / Math.max(1, daysUntilPayday));

  return {
    availableBalanceMinor, expectedIncomeMinor, unpaidReservedCommitmentsMinor, plannedSavingsMinor,
    otherReservedMinor: 0, safeToSpendMinor, daysUntilPayday, dailyGuidelineMinor,
    isPaydayConfigured: !!paydayDayOfMonth, planningEndDate,
  };
}

export function calculateCategoryBudgets(params: {
  categories: Category[];
  budgets: MonthlyBudget[];
  transactions: Transaction[];
  currentDate: Date;
}): CategorySpendSummary[] {
  const { categories, budgets, transactions, currentDate } = params;
  const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const pacePercentage = Math.round((currentDate.getDate() / daysInMonth) * 100);
  const budgetMap = new Map<string, number>();
  for (const b of budgets) if (b.monthYear === currentMonthYear) budgetMap.set(b.categoryId, b.budgetMinor);
  const spendMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.categoryId) continue;
    const txDate = parseLocalDate(tx.transactionDate);
    if (txDate.getFullYear() === currentDate.getFullYear() && txDate.getMonth() === currentDate.getMonth()) {
      spendMap.set(tx.categoryId, (spendMap.get(tx.categoryId) || 0) + tx.amountMinor);
    }
  }
  return categories.filter((c) => !c.isIncome).map((category) => {
    const budgetMinor = budgetMap.get(category.id) || 0;
    const spentMinor = spendMap.get(category.id) || 0;
    const remainingMinor = budgetMinor - spentMinor;
    return {
      categoryId: category.id, categoryName: category.name, color: category.color,
      budgetMinor, spentMinor, remainingMinor,
      percentageUsed: budgetMinor > 0 ? Math.round((spentMinor / budgetMinor) * 100) : 0,
      isOverBudget: budgetMinor > 0 && spentMinor > budgetMinor, pacePercentage,
    };
  });
}

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
  const sevenDaysAgoStr = toLocalDateString(sevenDaysAgo);
  const todayStr = toLocalDateString(todayDate);
  let spentLast7DaysMinor = 0;
  let incomeLast7DaysMinor = 0;
  let transactionCount = 0;
  for (const tx of transactions) {
    if (tx.transactionDate < sevenDaysAgoStr || tx.transactionDate > todayStr) continue;
    transactionCount++;
    if (tx.type === 'expense') spentLast7DaysMinor += tx.amountMinor;
    else if (tx.type === 'income') incomeLast7DaysMinor += tx.amountMinor;
  }
  let actionableObservation = '';
  if (safeToSpend.safeToSpendMinor < 0) {
    actionableObservation = `Shortfall detected: You have a deficit of ${formatMoney(Math.abs(safeToSpend.safeToSpendMinor))} before your upcoming commitments. Pause discretionary spending until income arrives.`;
  } else if (safeToSpend.dailyGuidelineMinor > 0) {
    actionableObservation = `On track: You can safely spend up to ${formatMoney(safeToSpend.dailyGuidelineMinor)} per day across the remaining ${safeToSpend.daysUntilPayday} days while keeping savings protected.`;
  } else {
    actionableObservation = 'Commitments covered: Your bills are reserved. Add income or reduce allocations to unlock discretionary spending.';
  }
  return { spentLast7DaysMinor, incomeLast7DaysMinor, transactionCount, actionableObservation };
}
