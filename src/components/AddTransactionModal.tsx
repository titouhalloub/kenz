import React, { useState } from 'react';
import { X, ArrowDownRight, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { Account, Category, TransactionType } from '../domain/types';
import { parseToMinorUnits } from '../domain/financialCalculations';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  preferredCurrency: string;
  onSave: (data: {
    accountId: string;
    type: TransactionType;
    amountMinor: number;
    currency: string;
    categoryId?: string;
    destinationAccountId?: string;
    transactionDate: string;
    description?: string;
  }) => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  preferredCurrency,
  onSave,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(
    accounts.length > 1 ? accounts[1].id : ''
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const minor = parseToMinorUnits(amountStr);
    if (minor <= 0) {
      setError('Veuillez saisir un montant valide supérieur à 0.');
      return;
    }

    if (!accountId) {
      setError('Veuillez sélectionner un compte.');
      return;
    }

    if (type === 'transfer') {
      if (!destinationAccountId) {
        setError('Veuillez sélectionner le compte de destination.');
        return;
      }
      if (destinationAccountId === accountId) {
        setError('Le compte de destination doit être différent du compte source.');
        return;
      }
    }

    onSave({
      accountId,
      type,
      amountMinor: minor,
      currency: preferredCurrency,
      categoryId: type !== 'transfer' ? categoryId : undefined,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      transactionDate,
      description: description.trim() || undefined,
    });

    // Reset and close
    setAmountStr('');
    setDescription('');
    onClose();
  };

  const filteredCategories = categories.filter((c) =>
    type === 'income' ? c.isIncome : !c.isIncome
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Nouvelle opération</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Selector (Segmented control) */}
        <div className="grid grid-cols-3 gap-1.5 p-1 mt-4 bg-slate-950 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer ${
              type === 'expense'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Dépense</span>
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer ${
              type === 'income'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Revenu</span>
          </button>
          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer ${
              type === 'transfer'
                ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Virement</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl">
              {error}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Montant ({preferredCurrency})
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                autoFocus
                className="w-full h-12 px-4 text-xl font-bold font-mono-numbers bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                {preferredCurrency}
              </span>
            </div>
          </div>

          {/* Account Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {type === 'transfer' ? 'Compte source (Débit)' : 'Compte'}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            {type === 'transfer' ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Compte cible (Crédit)
                </label>
                <select
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {accounts
                    .filter((acc) => acc.id !== accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Catégorie</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {filteredCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Date</label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Note / Description (optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex. Supermarché, Facture..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer min-h-[44px]"
            >
              Enregistrer l'opération
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
