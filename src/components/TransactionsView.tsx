import React, { useState } from 'react';
import {
  Search,
  Download,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  Trash2,
  PlusCircle,
  Filter,
} from 'lucide-react';
import { Transaction, Account, Category, UserProfile, TransactionType } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  profile: UserProfile;
  onOpenAddModal: () => void;
  onDeleteTransaction: (id: string) => void;
  onExportCSV: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  accounts,
  categories,
  profile,
  onOpenAddModal,
  onDeleteTransaction,
  onExportCSV,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  // Filtering
  const filtered = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (selectedAccountId !== 'all' && tx.accountId !== selectedAccountId && tx.destinationAccountId !== selectedAccountId) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const cat = (tx.categoryId ? categoryMap.get(tx.categoryId) || '' : '').toLowerCase();
      const acc = (accountMap.get(tx.accountId) || '').toLowerCase();
      if (!desc.includes(q) && !cat.includes(q) && !acc.includes(q)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Header bar with CSV Export & Add action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Historique des opérations</h1>
          <p className="text-xs text-slate-400">
            {filtered.length} opération{filtered.length > 1 ? 's' : ''} répertoriée{filtered.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 text-xs font-medium transition cursor-pointer min-h-[44px]"
            title="Exporter en CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer min-h-[44px]"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ajouter</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Rechercher par libellé, catégorie ou compte..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Segmented Filter Controls */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
        <button
          onClick={() => setFilterType('all')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition min-h-[40px] whitespace-nowrap cursor-pointer ${
            filterType === 'all'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Toutes ({transactions.length})
        </button>
        <button
          onClick={() => setFilterType('expense')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition min-h-[40px] whitespace-nowrap cursor-pointer ${
            filterType === 'expense'
              ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Dépenses
        </button>
        <button
          onClick={() => setFilterType('income')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition min-h-[40px] whitespace-nowrap cursor-pointer ${
            filterType === 'income'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Revenus
        </button>
        <button
          onClick={() => setFilterType('transfer')}
          className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition min-h-[40px] whitespace-nowrap cursor-pointer ${
            filterType === 'transfer'
              ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Virements
        </button>
      </div>

      {/* Transactions List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/40 border border-slate-800 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-300">Aucune opération trouvée</p>
          <p className="text-xs text-slate-500">
            Modifiez vos filtres ou enregistrez une nouvelle opération pour commencer.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
          {filtered.map((tx) => {
            const accName = accountMap.get(tx.accountId) || 'Compte';
            const destName = tx.destinationAccountId ? accountMap.get(tx.destinationAccountId) : null;
            const catName = tx.categoryId ? categoryMap.get(tx.categoryId) : 'Virement';

            return (
              <div
                key={tx.id}
                className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Type Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.type === 'expense'
                        ? 'bg-rose-950/50 text-rose-400'
                        : tx.type === 'income'
                        ? 'bg-emerald-950/50 text-emerald-400'
                        : 'bg-blue-950/50 text-blue-400'
                    }`}
                  >
                    {tx.type === 'expense' ? (
                      <ArrowDownRight className="w-5 h-5" />
                    ) : tx.type === 'income' ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowLeftRight className="w-5 h-5" />
                    )}
                  </div>

                  {/* Transaction metadata (unboxed text separated by dots) */}
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {tx.description || catName}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <span>{tx.transactionDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {tx.type === 'transfer' && destName
                          ? `${accName} → ${destName}`
                          : accName}
                      </span>
                      {tx.type !== 'transfer' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{catName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Amount and delete button */}
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold font-mono-numbers ${
                      tx.type === 'expense'
                        ? 'text-rose-400'
                        : tx.type === 'income'
                        ? 'text-emerald-400'
                        : 'text-blue-400'
                    }`}
                  >
                    {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                    {formatMoney(tx.amountMinor, tx.currency, profile.locale)}
                  </span>

                  <button
                    onClick={() => onDeleteTransaction(tx.id)}
                    className="p-2 text-slate-500 hover:text-rose-400 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Supprimer cette opération"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
