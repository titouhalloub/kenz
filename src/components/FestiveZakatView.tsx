import React, { useState } from 'react';
import {
  Moon,
  Sparkles,
  Calculator,
  CheckCircle,
  AlertCircle,
  Plus,
  DollarSign,
  Gift,
  Heart,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import {
  ZakatState,
  FestiveBudget,
  calculateZakatSummary,
} from '../services/zakatFestiveStore';
import { formatMoney } from '../domain/financialCalculations';
import { UserProfile } from '../domain/types';

interface FestiveZakatViewProps {
  zakatState: ZakatState;
  onUpdateZakat: (state: ZakatState) => void;
  festiveBudgets: FestiveBudget[];
  onUpdateFestiveBudgets: (budgets: FestiveBudget[]) => void;
  profile: UserProfile;
  onOpenAIModal?: () => void;
}

export const FestiveZakatView: React.FC<FestiveZakatViewProps> = ({
  zakatState,
  onUpdateZakat,
  festiveBudgets,
  onUpdateFestiveBudgets,
  profile,
  onOpenAIModal,
}) => {
  const [activeTab, setActiveTab] = useState<'zakat' | 'festive'>('zakat');
  const [cash, setCash] = useState((zakatState.customCashMinor / 100).toString());
  const [savings, setSavings] = useState((zakatState.customSavingsMinor / 100).toString());
  const [business, setBusiness] = useState((zakatState.customBusinessGoodsMinor / 100).toString());
  const [liabilities, setLiabilities] = useState((zakatState.customLiabilitiesMinor / 100).toString());
  const [nisab, setNisab] = useState((zakatState.nisabThresholdMinor / 100).toString());

  const [newFestiveTitle, setNewFestiveTitle] = useState<'ramadan' | 'aid_adha' | 'aid_fitr'>('ramadan');
  const [newFestiveTarget, setNewFestiveTarget] = useState('50000');
  const [newFestiveNotes, setNewFestiveNotes] = useState('');
  const [showAddFestive, setShowAddFestive] = useState(false);

  const currentZakatState: ZakatState = {
    ...zakatState,
    customCashMinor: Math.round((parseFloat(cash) || 0) * 100),
    customSavingsMinor: Math.round((parseFloat(savings) || 0) * 100),
    customBusinessGoodsMinor: Math.round((parseFloat(business) || 0) * 100),
    customLiabilitiesMinor: Math.round((parseFloat(liabilities) || 0) * 100),
    nisabThresholdMinor: Math.round((parseFloat(nisab) || 950000) * 100),
  };

  const zakatSummary = calculateZakatSummary(currentZakatState);
  const currency = profile.preferredCurrency || 'DZD';

  const handleSaveZakatInputs = () => {
    onUpdateZakat(currentZakatState);
  };

  const handleTogglePaid = () => {
    const updated = {
      ...currentZakatState,
      isPaid: !currentZakatState.isPaid,
      paidDate: !currentZakatState.isPaid ? new Date().toISOString().split('T')[0] : undefined,
      paidAmountMinor: !currentZakatState.isPaid ? zakatSummary.zakatDueMinor : undefined,
    };
    onUpdateZakat(updated);
  };

  const handleAddFestiveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(newFestiveTarget) || 0;
    if (target <= 0) return;

    const newItem: FestiveBudget = {
      id: `fest_${Date.now()}`,
      userId: profile.id,
      festivalType: newFestiveTitle,
      year: new Date().getFullYear(),
      targetBudgetMinor: Math.round(target * 100),
      actualSpentMinor: 0,
      currency,
      notes: newFestiveNotes.trim() || undefined,
      isCompleted: false,
    };

    onUpdateFestiveBudgets([newItem, ...festiveBudgets]);
    setNewFestiveNotes('');
    setShowAddFestive(false);
  };

  const handleUpdateSpent = (id: string, spentStr: string) => {
    const val = parseFloat(spentStr) || 0;
    const updated = festiveBudgets.map((b) =>
      b.id === id ? { ...b, actualSpentMinor: Math.round(val * 100) } : b
    );
    onUpdateFestiveBudgets(updated);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Moon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              Phase 6 · Zakat, Sadaka & Fêtes
            </h1>
            <p className="text-xs text-slate-400">
              Calculateur de Zakat sur l'épargne et planification budgétaire pour le Ramadan et l'Aïd
            </p>
          </div>
        </div>

        {onOpenAIModal && (
          <button
            onClick={onOpenAIModal}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-600 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer min-h-[44px]"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Conseiller Zakat & Fêtes IA</span>
          </button>
        )}
      </div>

      {/* Tab Selectors */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('zakat')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center gap-2 ${
            activeTab === 'zakat'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Calculateur de Zakat</span>
        </button>
        <button
          onClick={() => setActiveTab('festive')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[44px] flex items-center gap-2 ${
            activeTab === 'festive'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Budget Ramadan & Aïd</span>
        </button>
      </div>

      {activeTab === 'zakat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span>Patrimoine soumis à la Zakat (Hawl révolu)</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Liquidités en espèces ({currency})
                  </label>
                  <input
                    type="number"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    onBlur={handleSaveZakatInputs}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono-numbers focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Épargne & Comptes Bancaires/CCP ({currency})
                  </label>
                  <input
                    type="number"
                    value={savings}
                    onChange={(e) => setSavings(e.target.value)}
                    onBlur={handleSaveZakatInputs}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono-numbers focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Marchandises / Commerce ({currency})
                  </label>
                  <input
                    type="number"
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                    onBlur={handleSaveZakatInputs}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono-numbers focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Dettes & Passifs exigibles ({currency})
                  </label>
                  <input
                    type="number"
                    value={liabilities}
                    onChange={(e) => setLiabilities(e.target.value)}
                    onBlur={handleSaveZakatInputs}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono-numbers focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-800/80">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Seuil du Nisab (équivalent 85g d'or pur en {currency})
                </label>
                <input
                  type="number"
                  value={nisab}
                  onChange={(e) => setNisab(e.target.value)}
                  onBlur={handleSaveZakatInputs}
                  className="w-full sm:w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono-numbers focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Le Nisab standard en Algérie tourne généralement autour de 950 000 DZD selon le cours de l'or.
                </p>
              </div>
            </div>
          </div>

          {/* Summary & Result Card */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Bilan Zakat Annuel</span>
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <span className="text-xs text-slate-400">Total Actifs :</span>
                  <span className="text-sm font-bold text-slate-100 font-mono-numbers">
                    {formatMoney(zakatSummary.totalAssetsMinor, currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <span className="text-xs text-slate-400">Patrimoine Net :</span>
                  <span className="text-sm font-bold text-slate-100 font-mono-numbers">
                    {formatMoney(zakatSummary.netWealthMinor, currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <span className="text-xs text-slate-400">Seuil Nisab :</span>
                  <span className="text-sm font-semibold text-slate-300 font-mono-numbers">
                    {formatMoney(zakatSummary.nisabThresholdMinor, currency)}
                  </span>
                </div>

                <div className="pt-2">
                  <div className="text-xs text-slate-400 mb-1">Statut d'éligibilité :</div>
                  {zakatSummary.isEligible ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>Éligible à la Zakat (2.5% du net)</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-slate-500" />
                      <span>En dessous du Nisab (Zakat non obligatoire)</span>
                    </div>
                  )}
                </div>

                {zakatSummary.isEligible && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-600/10 border border-emerald-500/40 text-center">
                    <div className="text-xs text-emerald-400 font-medium">Montant de Zakat Dû (2.5%)</div>
                    <div className="text-2xl font-black text-emerald-300 font-mono-numbers mt-1">
                      {formatMoney(zakatSummary.zakatDueMinor, currency)}
                    </div>

                    <button
                      onClick={handleTogglePaid}
                      className={`mt-4 w-full py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                        currentZakatState.isPaid
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-slate-900 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600 hover:text-white'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{currentZakatState.isPaid ? 'Zakat Acquittée ✓' : 'Marquer comme Acquittée'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'festive' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Gift className="w-4 h-4 text-emerald-400" />
              <span>Budgets Fêtes & Ramadan (2026)</span>
            </h2>

            <button
              onClick={() => setShowAddFestive(!showAddFestive)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Budget Fête</span>
            </button>
          </div>

          {showAddFestive && (
            <form onSubmit={handleAddFestiveBudget} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Type d'événement</label>
                  <select
                    value={newFestiveTitle}
                    onChange={(e) => setNewFestiveTitle(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="ramadan">Mois de Ramadan & Aïd al-Fitr</option>
                    <option value="aid_adha">Aïd al-Adha (Mouton)</option>
                    <option value="aid_fitr">Aïd al-Fitr uniquement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Budget Cible ({currency})</label>
                  <input
                    type="number"
                    value={newFestiveTarget}
                    onChange={(e) => setNewFestiveTarget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono-numbers"
                    placeholder="ex: 60000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes / Détails (courses, cadeaux, etc.)</label>
                <input
                  type="text"
                  value={newFestiveNotes}
                  onChange={(e) => setNewFestiveNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  placeholder="ex: Viande, gâteaux traditionnels, vêtements enfants"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddFestive(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer"
                >
                  Créer le budget
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {festiveBudgets.map((b) => {
              const pct = Math.min(100, Math.round((b.actualSpentMinor / b.targetBudgetMinor) * 100));
              const isOver = b.actualSpentMinor > b.targetBudgetMinor;

              const titleMap = {
                ramadan: 'Ramadan & Aïd al-Fitr',
                aid_adha: 'Aïd al-Adha (Mouton)',
                aid_fitr: 'Aïd al-Fitr',
              };

              return (
                <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {titleMap[b.festivalType] || b.festivalType} · {b.year}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100 mt-2">{b.notes || 'Prévisions de dépenses'}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-2 border-y border-slate-800">
                    <div>
                      <div className="text-[11px] text-slate-400">Budget Prévu</div>
                      <div className="text-sm font-bold text-slate-100 font-mono-numbers">
                        {formatMoney(b.targetBudgetMinor, b.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Dépensé Réel</div>
                      <div className={`text-sm font-bold font-mono-numbers ${isOver ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatMoney(b.actualSpentMinor, b.currency)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Progression</span>
                      <span className="font-mono-numbers text-slate-300">{pct}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all ${isOver ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-xs text-slate-400">Mettre à jour dépensé ({b.currency}) :</span>
                    <input
                      type="number"
                      defaultValue={(b.actualSpentMinor / 100).toString()}
                      onBlur={(e) => handleUpdateSpent(b.id, e.target.value)}
                      className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono-numbers"
                    />
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
