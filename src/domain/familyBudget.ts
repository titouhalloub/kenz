export type FamilyBudgetCategoryId =
  | 'housing' | 'food' | 'cleaning' | 'hygiene' | 'clothing' | 'transport'
  | 'education' | 'health' | 'communications' | 'maintenance' | 'debt'
  | 'savings' | 'other';

export interface FamilyBudgetCategory {
  id: FamilyBudgetCategoryId;
  plannedMinor: number;
  actualMinor: number;
}

export interface FamilyBudgetPlan {
  version: 1;
  userId: string;
  month: string;
  monthlyIncomeMinor: number;
  adults: number;
  children: number;
  categories: FamilyBudgetCategory[];
  updatedAt: string;
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
  { id: 'housing', plannedMinor: 0, actualMinor: 0 },
  { id: 'food', plannedMinor: 0, actualMinor: 0 },
  { id: 'cleaning', plannedMinor: 0, actualMinor: 0 },
  { id: 'hygiene', plannedMinor: 0, actualMinor: 0 },
  { id: 'clothing', plannedMinor: 0, actualMinor: 0 },
  { id: 'transport', plannedMinor: 0, actualMinor: 0 },
  { id: 'education', plannedMinor: 0, actualMinor: 0 },
  { id: 'health', plannedMinor: 0, actualMinor: 0 },
  { id: 'communications', plannedMinor: 0, actualMinor: 0 },
  { id: 'maintenance', plannedMinor: 0, actualMinor: 0 },
  { id: 'debt', plannedMinor: 0, actualMinor: 0 },
  { id: 'savings', plannedMinor: 0, actualMinor: 0 },
  { id: 'other', plannedMinor: 0, actualMinor: 0 },
];

const validMinor = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const localCurrentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };

export function createFamilyBudgetPlan(userId: string, month = localCurrentMonth()): FamilyBudgetPlan {
  return {
    version: 1, userId, month, monthlyIncomeMinor: 0, adults: 2, children: 0,
    categories: FAMILY_BUDGET_DEFAULTS.map((row) => ({ ...row })),
    updatedAt: new Date().toISOString(),
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
  field: 'plannedMinor' | 'actualMinor',
  value: number,
): FamilyBudgetPlan {
  if (!validMinor(value)) throw new RangeError('Budget amounts must be non-negative safe integers.');
  const categories = plan.categories.map((row) => row.id === id ? { ...row, [field]: value } : row);
  const total = categories.reduce((sum, row) => sum + row[field], 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Family budget total is too large.');
  return { ...plan, categories, updatedAt: new Date().toISOString() };
}

export function validateFamilyBudgetPlan(value: unknown, userId: string): FamilyBudgetPlan | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FamilyBudgetPlan>;
  if (candidate.version !== 1 || candidate.userId !== userId ||
      typeof candidate.month !== 'string' || !/^\d{4}-\d{2}$/.test(candidate.month) ||
      !validMinor(candidate.monthlyIncomeMinor) ||
      !Number.isInteger(candidate.adults) || (candidate.adults ?? 0) < 0 || (candidate.adults ?? 0) > 30 ||
      !Number.isInteger(candidate.children) || (candidate.children ?? 0) < 0 || (candidate.children ?? 0) > 30 ||
      !Array.isArray(candidate.categories)) return null;

  const allowed = new Set(FAMILY_BUDGET_DEFAULTS.map((row) => row.id));
  const seen = new Set<string>();
  const categories: FamilyBudgetCategory[] = [];
  for (const row of candidate.categories) {
    if (!row || !allowed.has(row.id) || seen.has(row.id) ||
        !validMinor(row.plannedMinor) || !validMinor(row.actualMinor)) return null;
    seen.add(row.id);
    categories.push({ id: row.id, plannedMinor: row.plannedMinor, actualMinor: row.actualMinor });
  }
  if (categories.length !== FAMILY_BUDGET_DEFAULTS.length || seen.size !== allowed.size) return null;
  if (!Number.isSafeInteger(categories.reduce((sum, row) => sum + row.plannedMinor, 0)) || !Number.isSafeInteger(categories.reduce((sum, row) => sum + row.actualMinor, 0))) return null;
  return { ...candidate, categories } as FamilyBudgetPlan;
}

export function familyBudgetStorageKey(userId: string, month: string): string {
  return `kenz_family_budget_v1_${encodeURIComponent(userId)}_${month}`;
}
