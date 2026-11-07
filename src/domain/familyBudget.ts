export type FamilyBudgetCategoryId =
  | 'housing' | 'food' | 'cleaning' | 'hygiene' | 'clothing' | 'transport'
  | 'education' | 'health' | 'communications' | 'maintenance' | 'debt'
  | 'savings' | 'other';

export interface FamilyBudgetCategory {
  id: FamilyBudgetCategoryId;
  plannedMinor: number;
  actualMinor: number;
  priority: number;
  /** True when the user explicitly set this envelope, including an intentional zero. */
  plannedOverride?: boolean;
}

export interface FamilyBudgetPlan {
  version: 1;
  userId: string;
  month: string;
  monthlyIncomeMinor: number;
  /** Optional user override for the income used in this month's family plan. */
  monthlyIncomeOverrideMinor?: number | null;
  adults: number;
  children: number;
  categories: FamilyBudgetCategory[];
  updatedAt: string;
}

export type FamilyBudgetRecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

/** Count scheduled occurrences falling inside a calendar month, starting at nextDueDate. */
export function countRecurringOccurrencesInMonth(
  frequency: FamilyBudgetRecurrenceFrequency,
  nextDueDate: string,
  month: string,
  billingDayOfMonth?: number,
): number {
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(nextDueDate)) return 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const [dueYear, dueMonth, dueDay] = nextDueDate.split('-').map(Number);
  const monthStart = Date.UTC(year, monthNumber - 1, 1);
  const monthEnd = Date.UTC(year, monthNumber, 0);
  const dueTime = Date.UTC(dueYear, dueMonth - 1, dueDay);
  if (!Number.isFinite(dueTime) || dueTime > monthEnd) return 0;

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const periodDays = frequency === 'weekly' ? 7 : 14;
    const dayMs = 86_400_000;
    const firstStep = Math.max(0, Math.ceil((monthStart - dueTime) / (periodDays * dayMs)));
    let cursor = dueTime + firstStep * periodDays * dayMs;
    let count = 0;
    while (cursor <= monthEnd) { count++; cursor += periodDays * dayMs; }
    return count;
  }

  const intervalMonths = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const targetIndex = year * 12 + monthNumber - 1;
  const dueIndex = dueYear * 12 + dueMonth - 1;
  if (targetIndex < dueIndex || (targetIndex - dueIndex) % intervalMonths !== 0) return 0;
  const billingDay = Math.min(Math.max(1, billingDayOfMonth ?? dueDay), new Date(Date.UTC(year, monthNumber, 0)).getUTCDate());
  const occurrence = Date.UTC(year, monthNumber - 1, billingDay);
  return occurrence >= Math.max(monthStart, dueTime) && occurrence <= monthEnd ? 1 : 0;
}

export interface FamilyBudgetSummary {
  incomeMinor: number;
  plannedMinor: number;
  actualMinor: number;
  unallocatedMinor: number;
  remainingPlannedMinor: number;
  deficitMinor: number;
}

export const FAMILY_BUDGET_DEFAULTS: FamilyBudgetCategory[] = [
  { id: 'housing', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'food', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'cleaning', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'hygiene', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'clothing', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'transport', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'education', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'health', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'communications', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'maintenance', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'debt', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'savings', plannedMinor: 0, actualMinor: 0, priority: 3 },
  { id: 'other', plannedMinor: 0, actualMinor: 0, priority: 3 },
];

const validMinor = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const localCurrentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };

export function createFamilyBudgetPlan(userId: string, month = localCurrentMonth()): FamilyBudgetPlan {
  return {
    version: 1, userId, month, monthlyIncomeMinor: 0, adults: 2, children: 0,
    categories: FAMILY_BUDGET_DEFAULTS.map((row) => ({ ...row, plannedOverride: false })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Combines saved family choices with live Kenz records.
 * Explicit user allocations always win over recurring-commitment suggestions,
 * including an intentional zero. Actuals always come from recorded transactions.
 */
export function applyFamilyBudgetSources(
  plan: FamilyBudgetPlan,
  recurringPlannedByCategory: ReadonlyMap<FamilyBudgetCategoryId, number>,
  actualByCategory: ReadonlyMap<FamilyBudgetCategoryId, number>,
): FamilyBudgetPlan {
  return {
    ...plan,
    categories: plan.categories.map((row) => ({
      ...row,
      plannedMinor: row.plannedOverride || row.plannedMinor > 0
        ? row.plannedMinor
        : recurringPlannedByCategory.get(row.id) ?? row.plannedMinor,
      actualMinor: actualByCategory.get(row.id) ?? 0,
    })),
  };
}

export function summarizeFamilyBudget(plan: FamilyBudgetPlan): FamilyBudgetSummary {
  const plannedMinor = plan.categories.reduce((sum, row) => { const total = sum + row.plannedMinor; if (!Number.isSafeInteger(total)) throw new RangeError('Planned budget total is too large.'); return total; }, 0);
  const actualMinor = plan.categories.reduce((sum, row) => { const total = sum + row.actualMinor; if (!Number.isSafeInteger(total)) throw new RangeError('Actual spending total is too large.'); return total; }, 0);
  const unallocatedMinor = plan.monthlyIncomeMinor - plannedMinor;
  return {
    incomeMinor: plan.monthlyIncomeMinor,
    plannedMinor,
    actualMinor,
    unallocatedMinor,
    remainingPlannedMinor: plannedMinor - actualMinor,
    deficitMinor: Math.max(0, -unallocatedMinor),
  };
}

export function updateFamilyCategory(
  plan: FamilyBudgetPlan,
  id: FamilyBudgetCategoryId,
  field: 'plannedMinor' | 'actualMinor' | 'priority',
  value: number,
): FamilyBudgetPlan {
  if (field === 'priority') {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError('Priority must be between 1 and 5.');
    return { ...plan, categories: plan.categories.map((row) => row.id === id ? { ...row, priority: value } : row), updatedAt: new Date().toISOString() };
  }
  if (!validMinor(value)) throw new RangeError('Budget amounts must be non-negative safe integers.');
  const categories = plan.categories.map((row) => row.id === id ? { ...row, [field]: value, ...(field === 'plannedMinor' ? { plannedOverride: true } : {}) } : row);
  const total = categories.reduce((sum, row) => sum + row[field], 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Family budget total is too large.');
  return { ...plan, categories, updatedAt: new Date().toISOString() };
}

export function validateFamilyBudgetPlan(value: unknown, userId: string): FamilyBudgetPlan | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FamilyBudgetPlan>;
  if (candidate.version !== 1 || candidate.userId !== userId ||
      typeof candidate.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate.month) ||
      !validMinor(candidate.monthlyIncomeMinor) ||
      (candidate.monthlyIncomeOverrideMinor !== undefined && candidate.monthlyIncomeOverrideMinor !== null && !validMinor(candidate.monthlyIncomeOverrideMinor)) ||
      !Number.isInteger(candidate.adults) || (candidate.adults ?? 0) < 0 || (candidate.adults ?? 0) > 30 ||
      !Number.isInteger(candidate.children) || (candidate.children ?? 0) < 0 || (candidate.children ?? 0) > 30 ||
      !Array.isArray(candidate.categories)) return null;

  const allowed = new Set(FAMILY_BUDGET_DEFAULTS.map((row) => row.id));
  const seen = new Set<string>();
  const categories: FamilyBudgetCategory[] = [];
  for (const row of candidate.categories) {
    if (!row || !allowed.has(row.id) || seen.has(row.id) ||
        !validMinor(row.plannedMinor) || !validMinor(row.actualMinor) ||
        (row.plannedOverride !== undefined && typeof row.plannedOverride !== 'boolean') ||
        (row.priority !== undefined && (!Number.isInteger(row.priority) || row.priority < 1 || row.priority > 5))) return null;
    seen.add(row.id);
    categories.push({ id: row.id, plannedMinor: row.plannedMinor, actualMinor: row.actualMinor, priority: row.priority ?? 3, plannedOverride: row.plannedOverride ?? row.plannedMinor > 0 });
  }
  if (categories.length !== FAMILY_BUDGET_DEFAULTS.length || seen.size !== allowed.size) return null;
  if (!Number.isSafeInteger(categories.reduce((sum, row) => sum + row.plannedMinor, 0)) || !Number.isSafeInteger(categories.reduce((sum, row) => sum + row.actualMinor, 0))) return null;
  return { ...candidate, categories } as FamilyBudgetPlan;
}

export function familyBudgetStorageKey(userId: string, month: string): string {
  return `kenz_family_budget_v1_${encodeURIComponent(userId)}_${month}`;
}

export function suggestFamilyBudgetAllocations(plan: FamilyBudgetPlan): FamilyBudgetPlan {
  if (!validMinor(plan.monthlyIncomeMinor)) return plan;
  const fixedTotal = plan.categories.reduce((sum, row) => sum + row.plannedMinor, 0);
  if (!Number.isSafeInteger(fixedTotal) || fixedTotal >= plan.monthlyIncomeMinor) return plan;
  const eligible = plan.categories.filter((row) => row.plannedMinor === 0);
  if (eligible.length === 0) return plan;
  const remaining = plan.monthlyIncomeMinor - fixedTotal;
  const weightTotal = eligible.reduce((sum, row) => sum + row.priority, 0);
  if (!Number.isSafeInteger(weightTotal) || weightTotal <= 0) return plan;
  let assigned = 0;
  const shares = new Map<string, number>();
  for (const row of eligible) {
    const share = Number((BigInt(remaining) * BigInt(row.priority)) / BigInt(weightTotal));
    shares.set(row.id, share);
    assigned += share;
  }
  let remainder = remaining - assigned;
  for (const row of eligible) {
    if (remainder <= 0) break;
    shares.set(row.id, (shares.get(row.id) || 0) + 1);
    remainder--;
  }
  return {
    ...plan,
    categories: plan.categories.map((row) => shares.has(row.id) ? { ...row, plannedMinor: shares.get(row.id)!, plannedOverride: true } : row),
    updatedAt: new Date().toISOString(),
  };
}
