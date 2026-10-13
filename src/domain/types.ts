/**
 * Core Financial Domain Types for Phase 1 Budget MVP
 * Invariant: All monetary amounts are exact integers representing minor units
 * (e.g. 100 DA = 10000 minor units or 100 DA integer if 0 minor unit; standard 1 DZD = 100 centimes).
 */

export type TransactionType = 'income' | 'expense' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'savings' | 'other';
export type CommitmentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'archived';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  preferredCurrency: string; // 'DZD', 'EUR', 'USD'
  locale: 'ar' | 'fr' | 'en';
  paydayDayOfMonth?: number; // 1-31
  planningPeriodDays: number; // default 30
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalanceMinor: number;
  isArchived: boolean;
}

export interface Category {
  id: string;
  userId?: string;
  name: string;
  icon?: string;
  color?: string;
  isIncome: boolean;
  isSystem: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  type: TransactionType;
  amountMinor: number; // Positive integer in minor units
  currency: string;
  categoryId?: string;
  destinationAccountId?: string; // For transfers
  linkedTransferId?: string; // Links paired transfer records
  transactionDate: string; // YYYY-MM-DD
  description?: string;
  idempotencyKey?: string;
  syncStatus?: 'synced' | 'pending';
  createdAt: string;
}

export interface MonthlyBudget {
  id: string;
  userId: string;
  categoryId: string;
  monthYear: string; // YYYY-MM-01
  budgetMinor: number;
  currency: string;
}

export interface RecurringItem {
  id: string;
  userId: string;
  name: string;
  type: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  frequency: CommitmentFrequency;
  categoryId?: string;
  nextDueDate: string; // YYYY-MM-DD
  isActive: boolean;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  currency: string;
  targetDate?: string; // YYYY-MM-DD
  plannedMonthlyContributionMinor: number;
  status: GoalStatus;
}

export interface SafeToSpendBreakdown {
  availableBalanceMinor: number;
  expectedIncomeMinor: number;
  unpaidReservedCommitmentsMinor: number;
  plannedSavingsMinor: number;
  otherReservedMinor: number;
  safeToSpendMinor: number; // Can be negative indicating a shortfall
  daysUntilPayday: number;
  dailyGuidelineMinor: number; // Clamped at 0 for daily spending, while safeToSpend reports shortfall
  isPaydayConfigured: boolean;
  planningEndDate: string;
}

export interface CategorySpendSummary {
  categoryId: string;
  categoryName: string;
  color?: string;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentageUsed: number;
  isOverBudget: boolean;
  pacePercentage: number; // Current day of month vs month length
}

/**
 * Phase 2 — Neighborhood Directory & Verification Types
 */
export type VerificationStatus =
  | 'unverified'
  | 'pending_review'
  | 'location_confirmed'
  | 'documents_verified'
  | 'rejected'
  | 'expired'
  | 'suspended';

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  description: string;
  phone: string;
  addressText: string;
  city: string;
  latitude: number;
  longitude: number;
  openingHours: string;
  verificationStatus: VerificationStatus;
  verificationDetails?: string;
  lastConfirmedDate: string;
  isPublished: boolean;
  documentsCount: number;
  createdAt: string;
}

export interface BusinessDocument {
  id: string;
  businessId: string;
  documentType: string; // 'Registre de Commerce (CNRC)', 'Agrément Artisanal', 'Pièce d'Identité'
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  status: 'pending' | 'verified' | 'rejected';
}

export interface VerificationReview {
  id: string;
  businessId: string;
  reviewerId: string;
  previousStatus: VerificationStatus;
  newStatus: VerificationStatus;
  reasonCode: string;
  reviewerNotes?: string;
  reviewedAt: string;
}

export interface BusinessReport {
  id: string;
  businessId: string;
  businessName: string;
  reason: 'inaccurate_info' | 'closed_down' | 'suspicious' | 'duplicate' | 'other';
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

/**
 * Phase 4 — AI Gateway, Credits & Billing Types
 */
export type AIMode = 'managed' | 'byok';
export type BYOKProvider =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'perplexity'
  | 'custom';

export interface BYOKConfig {
  provider: BYOKProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AICreditWallet {
  userId: string;
  balanceCredits: number;
  lifetimeCreditsUsed: number;
  updatedAt: string;
}

export interface AIUsageEvent {
  id: string;
  userId: string;
  mode: AIMode;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  creditsDebited: number;
  purpose: 'explain_budget' | 'spending_leak_detector' | 'categorize' | 'savings_optimizer' | 'general_query';
  idempotencyKey?: string;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  entryType: 'grant' | 'purchase' | 'usage_debit' | 'refund';
  creditsDelta: number;
  balanceAfter: number;
  referenceId?: string;
  description: string;
  createdAt: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceMinor: number;
  currency: string;
  description: string;
}

/**
 * Phase 5 — Neighborhood Debt & Credit Ledger ("Carnet Kredy") & Financial Health Types
 */
export type DebtType = 'payable' | 'receivable'; // 'payable' = Je dois | 'receivable' = On me doit
export type DebtStatus = 'active' | 'partially_paid' | 'settled' | 'overdue';

export interface DebtPayment {
  id: string;
  debtId: string;
  amountMinor: number;
  paymentDate: string;
  sourceAccountId?: string;
  notes?: string;
  createdAt: string;
}

export interface DebtEntry {
  id: string;
  userId: string;
  businessId?: string; // Optional link to neighborhood merchant from Phase 2
  counterpartyName: string;
  counterpartyPhone?: string;
  type: DebtType;
  totalAmountMinor: number;
  remainingAmountMinor: number;
  currency: string;
  dueDate?: string;
  notes?: string;
  status: DebtStatus;
  payments: DebtPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface DebtSummary {
  totalPayableMinor: number; // Somme que je dois
  totalReceivableMinor: number; // Somme qu'on me doit
  netDebtMinor: number; // Créances - Dettes
  overdueCount: number;
  activeCount: number;
  settledCount: number;
}

export interface HealthScoreFactor {
  id: string;
  title: string;
  impact: 'positive' | 'neutral' | 'warning' | 'critical';
  description: string;
}

export interface FinancialHealthScore {
  score: number; // 0 to 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  debtToIncomeRatio: number;
  savingsRate: number;
  safeToSpendRunwayDays: number;
  factors: HealthScoreFactor[];
}

