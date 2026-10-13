import React, { useState } from 'react';
import {
  PieChart,
  Calendar,
  PiggyBank,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import {
  MonthlyBudget,
  RecurringItem,
  SavingsGoal,
  Category,
  Transaction,
  UserProfile,
} from '../domain/types';
import {
  formatMoney,
  calculateCategoryBudgets,
  parseToMinorUnits,
} from '../domain/financialCalculations';

interface PlanViewProps {
  categories: Category[];
  budgets: MonthlyBudget[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  profile: UserProfile;
  onUpdateBudget: (categoryId: string, budgetMinor: number) => void;
  onAddRecurring: (data: Omit<RecurringItem, 'id'>) => void;
  onDeleteRecurring: (id: string) => void;
  onAddSavingsGoal: (data: Omit<SavingsGoal, 'id'>) => void;
  onUpdateSavingsGoal: (goalId: string, updates: Partial<SavingsGoal>) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  categories,
  budgets,
  recurringItems,
  savingsGoals,
  transactions,
  profile,
  onUpdateBudget,
  onAddRecurring,
  onDeleteRecurring,
  onAddSavingsGoal,
  onUpdateSavingsGoal,
}) => {
  const [activeTab, setActiveTab] = useState<'budgets' | 'recurring' | 'goals'>('budgets');

  // New recurring state
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recName, setRecName] = useState('');
  const [recType, setRecType] = useState<'income' | 'expense'>('expense');
  const [recAmountStr, setRecAmountStr] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recCategoryId, setRecCategoryId] = useState(categories[0]?.id || '');

  // New goal state
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTargetStr, setGoalTargetStr] = useState('');
  const [goalMonthlyStr, setGoalMonthlyStr] = useState('');

  // Editing budget inline state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editBudgetAmount, setEditBudgetAmount] = useState('');

  const today = new Date();
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
      frequency: 'monthly',
      categoryId: recCategoryId || undefined,
      nextDueDate: recDueDate,
      isActive: true,
    });

    setRecName('');
    setRecAmountStr('');
    setRecDueDate('');
    setShowAddRecurring(false);
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
    <div className="space-y-5 pb-24">
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Plan budgétaire & Engagements</h1>
        <p className="text-xs text-slate-400">
          Maîtrisez vos enveloppes, vos charges fixes et sécurisez vos projets d'épargne.
        </p>
      </div>

      {/* Segmented Sub-navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
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

              return (
                <div
                  key={item.categoryId}
                  className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
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
                Nouvel engagement mensuel
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

          {/* List of Recurring */}
          <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {recurringItems.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">{item.name}</span>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                    <span className="capitalize">{item.type === 'income' ? 'Revenu' : 'Facture'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Échéance: {item.nextDueDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-bold font-mono-numbers ${
                      item.type === 'income' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {item.type === 'income' ? '+' : '-'}
                    {formatMoney(item.amountMinor, item.currency, profile.locale)}
                  </span>
                  <button
                    onClick={() => onDeleteRecurring(item.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label="Supprimer cet engagement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SAVINGS GOALS */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Projets & Objectifs ({savingsGoals.length})
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
            {savingsGoals.map((goal) => {
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
    </div>
  );
};
