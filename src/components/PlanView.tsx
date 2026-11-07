import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Calendar,
  ShoppingBag,
  Home,
  Zap,
  Car,
  Heart,
  Users,
  Briefcase,
  TrendingUp,
  Utensils,
  Gamepad2,
  GraduationCap,
  Shirt,
  Plane,
  Coffee,
  PawPrint,
  Fuel,
  CircleHelp,
  Landmark,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Trophy,
  Flame,
  CalendarClock,
  Bell,
  BellRing,
  Check,
  Pause,
  Play,
} from 'lucide-react';
import {
  MonthlyBudget,
  RecurringItem,
  SavingsGoal,
  Category,
  Transaction,
  UserProfile,
  SavingsChallengeContribution,
  SavingsChallengeFrequency,
  Account,
  CommitmentFrequency,
} from '../domain/types';
import { FamilyLifePlannerView } from './FamilyLifePlannerView';
import { getBillReminderPermission, requestBillReminderPermission, dispatchBillReminders, daysUntilBill, formatBillDueLabel } from '../services/billReminderService';
import {
  formatMoney,
  calculateCategoryBudgets,
  parseToMinorUnits,
} from '../domain/financialCalculations';

const getBudgetCategoryIcon = (name?: string) => {
  const icons: Record<string, React.ElementType> = {
    ShoppingBag, Home, Zap, Car, Heart, Users, Briefcase, TrendingUp,
    Utensils, Gamepad2, GraduationCap, Shirt, Plane, Coffee, PawPrint, Fuel, Landmark,
  };
  return icons[name || ''] || CircleHelp;
};


const getLocalDateString = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface PlanViewProps {
  categories: Category[];
  budgets: MonthlyBudget[];
  recurringItems: RecurringItem[];
  accounts: Account[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  profile: UserProfile;
  onUpdateBudget: (categoryId: string, budgetMinor: number) => void;
  onAddRecurring: (data: Omit<RecurringItem, 'id'>) => void;
  onDeleteRecurring: (id: string) => void;
  onMarkRecurringPaid: (id: string) => void;
  onToggleRecurring: (id: string, isActive: boolean) => void;
  onUpdateRecurring: (id: string, updates: Partial<RecurringItem>) => void;
  onAddSavingsGoal: (data: Omit<SavingsGoal, 'id'>) => void;
  onUpdateSavingsGoal: (goalId: string, updates: Partial<SavingsGoal>) => void;
  challengeContributions: SavingsChallengeContribution[];
  onAddChallengeContribution: (goalId: string, amountMinor: number, date: string) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  categories,
  budgets,
  recurringItems,
  accounts,
  savingsGoals,
  transactions,
  profile,
  onUpdateBudget,
  onAddRecurring,
  onDeleteRecurring,
  onMarkRecurringPaid,
  onToggleRecurring,
  onUpdateRecurring,
  onAddSavingsGoal,
  onUpdateSavingsGoal,
  challengeContributions,
  onAddChallengeContribution,
}) => {
  const [activeTab, setActiveTab] = useState<'budgets' | 'recurring' | 'goals' | 'challenges' | 'family'>('budgets');

  // New recurring state
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recName, setRecName] = useState('');
  const [recType, setRecType] = useState<'income' | 'expense'>('expense');
  const [recAmountStr, setRecAmountStr] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recCategoryId, setRecCategoryId] = useState(categories.find((category) => !category.isIncome)?.id || '');
  const [recFrequency, setRecFrequency] = useState<CommitmentFrequency>('monthly');
  const [recAccountId, setRecAccountId] = useState(accounts.find((account) => !account.isArchived)?.id || '');
  const [recReminderEnabled, setRecReminderEnabled] = useState(true);
  const [recReminderDaysBefore, setRecReminderDaysBefore] = useState(1);
  const [notificationPermission, setNotificationPermission] = useState(getBillReminderPermission());

  // New goal state
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTargetStr, setGoalTargetStr] = useState('');
  const [goalMonthlyStr, setGoalMonthlyStr] = useState('');
  const [showAddChallenge, setShowAddChallenge] = useState(false);
  const [challengeName, setChallengeName] = useState('');
  const [challengeTargetStr, setChallengeTargetStr] = useState('');
  const [challengePeriodStr, setChallengePeriodStr] = useState('');
  const [challengeFrequency, setChallengeFrequency] = useState<SavingsChallengeFrequency>('weekly');
  const [challengeEndDate, setChallengeEndDate] = useState('');

  // Editing budget inline state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editBudgetAmount, setEditBudgetAmount] = useState('');

  useEffect(() => {
    const matchingCategory = categories.find((category) => category.isIncome === (recType === 'income'));
    if (matchingCategory && !categories.some((category) => category.id === recCategoryId && category.isIncome === (recType === 'income'))) {
      setRecCategoryId(matchingCategory.id);
    }
  }, [categories, recCategoryId, recType]);

  useEffect(() => {
    if (!accounts.some((account) => account.id === recAccountId && !account.isArchived && account.currency === profile.preferredCurrency)) {
      setRecAccountId(accounts.find((account) => !account.isArchived && account.currency === profile.preferredCurrency)?.id || '');
    }
  }, [accounts, recAccountId, profile.preferredCurrency]);

  const today = new Date();
  const activeBills = recurringItems.filter((item) => item.isActive);
  const overdueBills = activeBills.filter((item) => daysUntilBill(item.nextDueDate) < 0);
  const upcomingBills = activeBills.filter((item) => daysUntilBill(item.nextDueDate) >= 0 && daysUntilBill(item.nextDueDate) <= 7)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const categoryBudgets = calculateCategoryBudgets({
    categories,
    budgets,
    transactions,
    currentDate: today,
  });

  const handleCreateRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    const minor = parseToMinorUnits(recAmountStr);
    if (minor <= 0 || !recName.trim() || !recDueDate) return;

    onAddRecurring({
      userId: profile.id,
      name: recName.trim(),
      type: recType,
      amountMinor: minor,
      currency: profile.preferredCurrency,
      frequency: recFrequency,
      categoryId: recCategoryId || undefined,
      nextDueDate: recDueDate,
      isActive: true,
      accountId: recAccountId || undefined,
      billingDayOfMonth: Number(recDueDate.slice(8, 10)),
      reminderEnabled: recReminderEnabled,
      reminderDaysBefore: recReminderDaysBefore,
    });

    setRecName('');
    setRecAmountStr('');
    setRecDueDate('');
    setRecFrequency('monthly');
    setRecReminderEnabled(true);
    setRecReminderDaysBefore(1);
    setShowAddRecurring(false);
  };

  const handleCreateChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMinor = parseToMinorUnits(challengeTargetStr);
    const periodMinor = parseToMinorUnits(challengePeriodStr);
    const startDate = getLocalDateString();
    if (!challengeName.trim() || targetMinor <= 0 || periodMinor <= 0 || !challengeEndDate || challengeEndDate <= startDate) return;
    onAddSavingsGoal({
      userId: profile.id,
      name: challengeName.trim(),
      targetAmountMinor: targetMinor,
      currentAmountMinor: 0,
      currency: profile.preferredCurrency,
      plannedMonthlyContributionMinor: challengeFrequency === 'monthly' ? periodMinor : 0,
      status: 'active',
      challengeFrequency,
      challengePeriodAmountMinor: periodMinor,
      challengeStartDate: startDate,
      challengeEndDate,
      challengeStartingAmountMinor: 0,
    });
    setChallengeName('');
    setChallengeTargetStr('');
    setChallengePeriodStr('');
    setChallengeEndDate('');
    setChallengeFrequency('weekly');
    setShowAddChallenge(false);
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMinor = parseToMinorUnits(goalTargetStr);
    const monthlyMinor = parseToMinorUnits(goalMonthlyStr);
    if (targetMinor <= 0 || !goalName.trim()) return;

    onAddSavingsGoal({
      userId: profile.id,
      name: goalName.trim(),
      targetAmountMinor: targetMinor,
      currentAmountMinor: 0,
      currency: profile.preferredCurrency,
      plannedMonthlyContributionMinor: monthlyMinor,
      status: 'active',
    });

    setGoalName('');
    setGoalTargetStr('');
    setGoalMonthlyStr('');
    setShowAddGoal(false);
  };

  return (
    <div className="kenz-page kenz-plan-page space-y-5 pb-24">
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Plan budgétaire & Engagements</h1>
        <p className="text-xs text-slate-400">
          Maîtrisez vos enveloppes, vos charges fixes et sécurisez vos projets d'épargne.
        </p>
      </div>

      {/* Segmented Sub-navigation */}
      <div className="kenz-plan-tabs grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveTab('family')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[44px] cursor-pointer ${
            activeTab === 'family' ? 'bg-slate-800 text-violet-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Famille
        </button>
        <button
          onClick={() => setActiveTab('budgets')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[44px] cursor-pointer ${
            activeTab === 'budgets'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Enveloppes du mois
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[44px] cursor-pointer ${
            activeTab === 'recurring'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Charges & Salaires
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[44px] cursor-pointer ${
            activeTab === 'goals'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Objectifs d'épargne
        </button>
        <button
          onClick={() => setActiveTab('challenges')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[44px] cursor-pointer ${
            activeTab === 'challenges' ? 'bg-slate-800 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Défis d'épargne
        </button>

      </div>

      {/* TAB 1: BUDGETS */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Rythme de dépenses vs progression du mois</span>
            <span className="font-mono-numbers">Jour {today.getDate()} du mois</span>
          </div>

          <div className="space-y-3">
            {categoryBudgets.map((item) => {
              const isEditing = editingCatId === item.categoryId;
              const category = categories.find((entry) => entry.id === item.categoryId);
              const BudgetIcon = getBudgetCategoryIcon(category?.icon);
              const accentColor = category?.color || '#7950cf';

              return (
                <div
                  key={item.categoryId}
                  className="kenz-challenge-card rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="kenz-budget-category-icon" style={{ color: accentColor, backgroundColor: `${accentColor}18` }}><BudgetIcon /></span>
                      <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-200 block">
                        {item.categoryName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span>Dépensé: {formatMoney(item.spentMinor, profile.preferredCurrency, profile.locale)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {item.budgetMinor > 0
                            ? `Budget: ${formatMoney(item.budgetMinor, profile.preferredCurrency, profile.locale)}`
                            : 'Sans plafond'}
                        </span>
                      </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (isEditing) {
                          const minor = parseToMinorUnits(editBudgetAmount);
                          onUpdateBudget(item.categoryId, minor);
                          setEditingCatId(null);
                        } else {
                          setEditingCatId(item.categoryId);
                          setEditBudgetAmount((item.budgetMinor / 100).toString());
                        }
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium min-h-[44px] px-2 flex items-center cursor-pointer"
                    >
                      {isEditing ? 'Valider' : item.budgetMinor > 0 ? 'Modifier' : 'Définir'}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editBudgetAmount}
                        onChange={(e) => setEditBudgetAmount(e.target.value)}
                        placeholder="Ex. 25000"
                        autoFocus
                        className="flex-1 h-10 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="px-3 h-10 text-xs text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : item.budgetMinor > 0 ? (
                    <div className="space-y-1.5">
                      {/* Dual Progress bar with month pace indicator */}
                      <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isOverBudget
                              ? 'bg-rose-500'
                              : item.percentageUsed > item.pacePercentage
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, item.percentageUsed)}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] font-mono-numbers">
                        <span className={item.isOverBudget ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                          {item.percentageUsed}% consommé
                        </span>
                        <span className="text-slate-400">
                          Reste: {formatMoney(item.remainingMinor, profile.preferredCurrency, profile.locale)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: RECURRING ITEMS */}
      {activeTab === 'recurring' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Engagements récurrents ({recurringItems.length})
            </h2>
            <button
              onClick={() => setShowAddRecurring(!showAddRecurring)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition min-h-[44px] cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Ajouter un engagement</span>
            </button>
          </div>

          {/* Add Recurring Form */}
          {showAddRecurring && (
            <form
              onSubmit={handleCreateRecurring}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3 shadow-lg"
            >
              <h3 className="text-xs font-semibold text-slate-200">
                Nouvelle facture ou entrée récurrente
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecType('expense')}
                  className={`py-2 rounded-xl text-xs font-semibold transition min-h-[44px] cursor-pointer ${
                    recType === 'expense'
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                      : 'bg-slate-950 text-slate-400'
                  }`}
                >
                  Facture / Dépense
                </button>
                <button
                  type="button"
                  onClick={() => setRecType('income')}
                  className={`py-2 rounded-xl text-xs font-semibold transition min-h-[44px] cursor-pointer ${
                    recType === 'income'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                      : 'bg-slate-950 text-slate-400'
                  }`}
                >
                  Salaire / Revenu
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Nom du poste</label>
                <input
                  type="text"
                  placeholder="Ex. Loyer, Sonelgaz, Salaire..."
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  required
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Montant ({profile.preferredCurrency})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={recAmountStr}
                    onChange={(e) => setRecAmountStr(e.target.value)}
                    required
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Prochaine échéance</label>
                  <input
                    type="date"
                    value={recDueDate}
                    onChange={(e) => setRecDueDate(e.target.value)}
                    required
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Récurrence</label>
                  <select value={recFrequency} onChange={(e) => setRecFrequency(e.target.value as CommitmentFrequency)}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100">
                    <option value="weekly">Chaque semaine</option>
                    <option value="biweekly">Toutes les 2 semaines</option>
                    <option value="monthly">Chaque mois</option>
                    <option value="quarterly">Chaque trimestre</option>
                    <option value="yearly">Chaque année</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Compte associé</label>
                  <select value={recAccountId} onChange={(e) => setRecAccountId(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100">
                    <option value="">Choisir un compte</option>
                    {accounts.filter((account) => !account.isArchived && account.currency === profile.preferredCurrency).map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Catégorie</label>
                <select value={recCategoryId} onChange={(e) => setRecCategoryId(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100">
                  {categories.filter((category) => category.isIncome === (recType === 'income')).map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                <label className="flex items-center justify-between gap-3 text-xs text-slate-200">
                  <span className="inline-flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-400" /> Rappel avant échéance</span>
                  <input type="checkbox" checked={recReminderEnabled} onChange={(e) => setRecReminderEnabled(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                </label>
                {recReminderEnabled && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Me prévenir</label>
                    <select value={recReminderDaysBefore} onChange={(e) => setRecReminderDaysBefore(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100">
                      <option value={0}>Le jour même</option>
                      <option value={1}>1 jour avant</option>
                      <option value={3}>3 jours avant</option>
                      <option value={7}>7 jours avant</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer min-h-[44px]"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddRecurring(false)}
                  className="px-4 h-11 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-xs min-h-[44px]"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">Notifications de factures</h3>
                <p className="text-[11px] text-slate-400">Permission : {notificationPermission === 'granted' ? 'Activée' : notificationPermission === 'denied' ? 'Bloquée dans le navigateur' : notificationPermission === 'unsupported' ? 'Non disponible' : 'Non activée'}</p>
              </div>
              <button onClick={async () => {
                const permission = await requestBillReminderPermission();
                setNotificationPermission(permission);
                if (permission === 'granted') dispatchBillReminders(profile.id, recurringItems);
              }}
                disabled={notificationPermission === 'unsupported' || notificationPermission === 'granted' || notificationPermission === 'denied'}
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 text-xs font-semibold text-emerald-300 disabled:opacity-50">
                <BellRing className="w-3.5 h-3.5 inline mr-1" /> {notificationPermission === 'denied' ? 'Autoriser dans le navigateur' : notificationPermission === 'granted' ? 'Activées' : 'Activer'}
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">Kenz vérifie les échéances lorsque l'application est ouverte ou revient au premier plan. Les notifications programmées lorsque l'application est complètement fermée nécessitent un service push en arrière-plan.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-950 p-3"><div className="text-[10px] text-slate-500">En retard</div><div className="text-xl font-bold text-rose-400">{overdueBills.length}</div></div>
              <div className="rounded-xl bg-slate-950 p-3"><div className="text-[10px] text-slate-500">Dans les 7 jours</div><div className="text-xl font-bold text-amber-300">{upcomingBills.length}</div></div>
            </div>
          </div>

          {overdueBills.length > 0 && (
            <div className="rounded-2xl border border-rose-900/70 bg-rose-950/20 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-rose-300">Échéances en retard</h3>
              {overdueBills.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-200">{item.name}</span>
                  <span className="text-rose-300">{formatBillDueLabel(item.nextDueDate, profile.locale)}</span>
                </div>
              ))}
            </div>
          )}

          {/* List of Recurring */}
          <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {recurringItems.map((item) => {
              const dueDays = daysUntilBill(item.nextDueDate);
              const dueNow = dueDays <= 0;
              const account = accounts.find((row) => row.id === item.accountId && !row.isArchived && row.currency === item.currency);
              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-200 block">{item.name}</span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                        <span>{item.type === 'income' ? 'Revenu' : 'Facture'}</span>
                        <span>·</span><span>{item.frequency === 'weekly' ? 'Hebdomadaire' : item.frequency === 'biweekly' ? 'Toutes les 2 semaines' : item.frequency === 'quarterly' ? 'Trimestriel' : item.frequency === 'yearly' ? 'Annuel' : 'Mensuel'}</span>
                        <span>·</span><span>Échéance : {item.nextDueDate}</span>
                      </div>
                      <div className={`text-[11px] mt-1 ${dueDays < 0 ? 'text-rose-400' : dueDays === 0 ? 'text-amber-300' : 'text-slate-500'}`}>{item.isActive ? formatBillDueLabel(item.nextDueDate, profile.locale) : 'En pause'}{item.reminderEnabled ? ' · Rappel activé' : ''}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold font-mono-numbers ${item.type === 'income' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {item.type === 'income' ? '+' : '-'}{formatMoney(item.amountMinor, item.currency, profile.locale)}
                      </span>
                      <button onClick={() => onToggleRecurring(item.id, !item.isActive)} title={item.isActive ? 'Mettre en pause' : 'Reprendre'}
                        className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-emerald-300">
                        {item.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button onClick={() => onDeleteRecurring(item.id)} className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-rose-400" aria-label="Supprimer cet engagement">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Compte de paiement</label>
                      <select value={item.accountId || ''} onChange={(e) => onUpdateRecurring(item.id, { accountId: e.target.value || undefined })}
                        className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-200">
                        <option value="">Choisir un compte</option>
                        {accounts.filter((row) => !row.isArchived && row.currency === item.currency).map((row) => (
                          <option key={row.id} value={row.id}>{row.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-[11px] text-slate-400 h-5">
                        <input type="checkbox" checked={item.reminderEnabled ?? false}
                          onChange={(e) => onUpdateRecurring(item.id, { reminderEnabled: e.target.checked })}
                          className="w-3.5 h-3.5 accent-emerald-500" />
                        Activer le rappel
                      </label>
                      {item.reminderEnabled && (
                        <select value={item.reminderDaysBefore ?? 1}
                          onChange={(e) => onUpdateRecurring(item.id, { reminderDaysBefore: Number(e.target.value) })}
                          className="w-full h-8 px-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-300">
                          <option value={0}>Le jour même</option>
                          <option value={1}>1 jour avant</option>
                          <option value={3}>3 jours avant</option>
                          <option value={7}>7 jours avant</option>
                        </select>
                      )}
                    </div>
                  </div>
                  {dueNow && item.isActive && (
                    <button onClick={() => onMarkRecurringPaid(item.id)} disabled={!account}
                      className="w-full min-h-[42px] rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-xs font-semibold text-white disabled:opacity-40">
                      <Check className="w-3.5 h-3.5 inline mr-1" /> {item.type === 'income' ? 'Enregistrer le revenu reçu' : 'Enregistrer le paiement'}
                    </button>
                  )}
                  {!account && item.isActive && <p className="text-[10px] text-amber-400">Associez un compte à cet engagement pour enregistrer son paiement.</p>}
                </div>
              );
            })}
            {recurringItems.length === 0 && <p className="p-5 text-center text-xs text-slate-500">Aucune facture ou entrée récurrente.</p>}
          </div>
        </div>
      )}

      {/* TAB 3: SAVINGS GOALS */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Projets & Objectifs ({savingsGoals.filter((goal) => !goal.challengeFrequency).length})
            </h2>
            <button
              onClick={() => setShowAddGoal(!showAddGoal)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition min-h-[44px] cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nouvel objectif</span>
            </button>
          </div>

          {/* Add Goal Form */}
          {showAddGoal && (
            <form
              onSubmit={handleCreateGoal}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3 shadow-lg"
            >
              <h3 className="text-xs font-semibold text-slate-200">
                Créer un objectif d'épargne
              </h3>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Nom du projet</label>
                <input
                  type="text"
                  placeholder="Ex. Fonds de secours, Voyage, Voiture..."
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  required
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Montant Cible ({profile.preferredCurrency})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex. 100000"
                    value={goalTargetStr}
                    onChange={(e) => setGoalTargetStr(e.target.value)}
                    required
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Épargne mensuelle planifiée
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex. 10000"
                    value={goalMonthlyStr}
                    onChange={(e) => setGoalMonthlyStr(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer min-h-[44px]"
                >
                  Créer l'objectif
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddGoal(false)}
                  className="px-4 h-11 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-xs min-h-[44px]"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Goals List */}
          <div className="space-y-3">
            {savingsGoals.filter((goal) => !goal.challengeFrequency).map((goal) => {
              const progressPct = Math.min(
                100,
                Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100)
              );

              return (
                <div
                  key={goal.id}
                  className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">{goal.name}</span>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span>
                          Planifié: {formatMoney(goal.plannedMonthlyContributionMinor, goal.currency, profile.locale)}/mois
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{goal.status}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono-numbers font-bold text-blue-400">
                      {progressPct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono-numbers text-slate-400 pt-1">
                    <span>Actuel: {formatMoney(goal.currentAmountMinor, goal.currency, profile.locale)}</span>
                    <span>Cible: {formatMoney(goal.targetAmountMinor, goal.currency, profile.locale)}</span>
                  </div>

                  {/* Quick deposit button into goal */}
                  <div className="flex gap-2 pt-1 border-t border-slate-800/60">
                    <button
                      onClick={() => {
                        const newAmount = goal.currentAmountMinor + goal.plannedMonthlyContributionMinor;
                        onUpdateSavingsGoal(goal.id, { currentAmountMinor: newAmount });
                      }}
                      className="flex-1 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition min-h-[44px] cursor-pointer"
                    >
                      + Verser cotisation (+{formatMoney(goal.plannedMonthlyContributionMinor, goal.currency, profile.locale)})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'challenges' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Mes défis ({savingsGoals.filter((goal) => goal.challengeFrequency).length})</h2>
              <p className="text-[11px] text-slate-500 mt-1">Un objectif, un rythme et des dépôts suivis dans le temps.</p>
            </div>
            <button
              onClick={() => setShowAddChallenge(!showAddChallenge)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white min-h-[44px]"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Nouveau défi
            </button>
          </div>

          {showAddChallenge && (
            <form onSubmit={handleCreateChallenge} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-100">Créer un défi d'épargne</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nom du défi</label>
                <input value={challengeName} onChange={(e) => setChallengeName(e.target.value)} required maxLength={70}
                  placeholder="Ex. Économiser pour un projet" className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Objectif total ({profile.preferredCurrency})</label>
                  <input value={challengeTargetStr} onChange={(e) => setChallengeTargetStr(e.target.value)} required inputMode="decimal" placeholder="Ex. 30000"
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Dépôt par période</label>
                  <input value={challengePeriodStr} onChange={(e) => setChallengePeriodStr(e.target.value)} required inputMode="decimal" placeholder="Ex. 2000"
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fréquence</label>
                  <select value={challengeFrequency} onChange={(e) => setChallengeFrequency(e.target.value as SavingsChallengeFrequency)}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100">
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdomadaire</option>
                    <option value="monthly">Mensuel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date de fin</label>
                  <input type="date" value={challengeEndDate} min={getLocalDateString(new Date(Date.now() + 86400000))} onChange={(e) => setChallengeEndDate(e.target.value)} required
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Tu peux mettre le défi en pause ou le reprendre à tout moment.</p>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-xs font-semibold">Créer le défi</button>
                <button type="button" onClick={() => setShowAddChallenge(false)} className="px-4 h-11 rounded-xl border border-slate-800 text-slate-400 text-xs">Annuler</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {savingsGoals.filter((goal) => goal.challengeFrequency).map((goal) => {
              const rows = challengeContributions.filter((row) => row.savingsGoalId === goal.id);
              const pendingMinor = rows.filter((row) => row.syncStatus === 'pending').reduce((sum, row) => sum + row.amountMinor, 0);
              const startingMinor = goal.challengeStartingAmountMinor ?? 0;
              const savedMinor = Math.max(0, goal.currentAmountMinor - startingMinor) + pendingMinor;
              const progress = goal.targetAmountMinor > 0 ? Math.min(100, Math.round(savedMinor / goal.targetAmountMinor * 100)) : 0;
              const frequencyLabel = goal.challengeFrequency === 'daily' ? 'Quotidien' : goal.challengeFrequency === 'weekly' ? 'Hebdomadaire' : 'Mensuel';
              const periodLabel = goal.challengeFrequency === 'daily' ? 'jour' : goal.challengeFrequency === 'weekly' ? 'semaine' : 'mois';
              const ordinal = (date: string) => {
                const d = new Date(date + 'T12:00:00');
                if (goal.challengeFrequency === 'monthly') return d.getFullYear() * 12 + d.getMonth();
                const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
                return goal.challengeFrequency === 'weekly' ? Math.floor((days + 3) / 7) : days;
              };
              const periodTotals = new Map<number, number>();
              for (const row of rows) {
                const period = ordinal(row.contributionDate);
                periodTotals.set(period, (periodTotals.get(period) || 0) + row.amountMinor);
              }
              const periods = new Set([...periodTotals.entries()]
                .filter(([, amount]) => amount >= (goal.challengePeriodAmountMinor || 0))
                .map(([period]) => period));
              let cursor = ordinal(getLocalDateString());
              if (!periods.has(cursor)) cursor -= 1;
              let currentStreak = 0;
              while (periods.has(cursor - currentStreak)) currentStreak += 1;
              let bestStreak = 0;
              let runningStreak = 0;
              let previousPeriod: number | null = null;
              for (const period of [...periods].sort((a, b) => a - b)) {
                runningStreak = previousPeriod !== null && period === previousPeriod + 1 ? runningStreak + 1 : 1;
                bestStreak = Math.max(bestStreak, runningStreak);
                previousPeriod = period;
              }
              const recent = rows.slice(0, 3);
              const expired = getLocalDateString() > (goal.challengeEndDate || '9999-12-31');
              const completed = goal.status === 'achieved' || progress >= 100;
              const paused = goal.status === 'paused';
              return (
                <div key={goal.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-100 truncate">{goal.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">{frequencyLabel} · {formatMoney(goal.challengePeriodAmountMinor || 0, goal.currency, profile.locale)} / {periodLabel}</div>
                    </div>
                    <span className={`text-xs font-bold ${completed ? 'text-emerald-400' : 'text-blue-300'}`}>{completed ? 'Terminé' : expired ? 'Expiré' : paused ? 'En pause' : `${progress}%`}</span>
                  </div>
                  <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono-numbers">
                    <span>{formatMoney(savedMinor, goal.currency, profile.locale)} économisés</span>
                    <span>{formatMoney(goal.targetAmountMinor, goal.currency, profile.locale)} cible</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /> Série actuelle : {currentStreak} · Record : {bestStreak}</span>
                    <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Jusqu'au {goal.challengeEndDate}</span>
                  </div>
                  {!completed && !expired && goal.status === 'active' && (
                    <button onClick={() => onAddChallengeContribution(goal.id, goal.challengePeriodAmountMinor || 0, getLocalDateString())}
                      className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300">
                      Enregistrer mon dépôt · {formatMoney(goal.challengePeriodAmountMinor || 0, goal.currency, profile.locale)}
                    </button>
                  )}
                  {!completed && !expired && (
                    <button onClick={() => onUpdateSavingsGoal(goal.id, { status: paused ? 'active' : 'paused' })}
                      className="w-full min-h-[40px] rounded-xl border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200">
                      {paused ? 'Reprendre le défi' : 'Mettre en pause'}
                    </button>
                  )}
                  {recent.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Derniers dépôts</p>
                      {recent.map((row) => <div key={row.id} className="flex justify-between text-[11px] text-slate-400"><span>{row.contributionDate}</span><span>{formatMoney(row.amountMinor, goal.currency, profile.locale)}{row.syncStatus === 'pending' ? ' · En attente de synchronisation' : ''}</span></div>)}
                    </div>
                  )}
                </div>
              );
            })}
            {savingsGoals.every((goal) => !goal.challengeFrequency) && !showAddChallenge && (
              <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">
                Aucun défi pour le moment. Crée ton premier défi et suis tes dépôts période après période.
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'family' && <FamilyLifePlannerView profile={profile} categories={categories} transactions={transactions} recurringItems={recurringItems} />}

    </div>
  );
};
