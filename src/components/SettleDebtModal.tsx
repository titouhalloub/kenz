import React, { useState } from 'react';
import { X, CheckCircle, Wallet, DollarSign, Calendar, FileText } from 'lucide-react';
import { DebtEntry, Account } from '../domain/types';
import { formatMoney, parseToMinorUnits } from '../domain/financialCalculations';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtEntry | null;
  accounts: Account[];
  onSettle: (params: {
    debtId: string;
    amountMinor: number;
    paymentDate: string;
    sourceAccountId?: string;
    notes?: string;
    createLinkedTransaction: boolean;
  }) => void;
}

export const SettleDebtModal: React.FC<SettleDebtModalProps> = ({
  isOpen,
  onClose,
  debt,
  accounts,
  onSettle,
}) => {
  if (!isOpen || !debt) return null;

  const [amountStr, setAmountStr] = useState(
    (debt.remainingAmountMinor / 100).toFixed(2).replace(/\.00$/, '')
  );
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createLinkedTransaction, setCreateLinkedTransaction] = useState(true);
  const [error, setError] = useState('');

  const isPayable = debt.type === 'payable';

  const handleQuickAmount = (ratio: number) => {
    const minor = Math.round(debt.remainingAmountMinor * ratio);
    setAmountStr((minor / 100).toFixed(2).replace(/\.00$/, ''));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const minor = parseToMinorUnits(amountStr);
    if (minor <= 0) {
      setError('Veuillez saisir un montant supérieur à 0.');
      return;
    }

    if (minor > debt.remainingAmountMinor) {
      setError(
        `Le montant dépasse le solde restant (${formatMoney(debt.remainingAmountMinor, debt.currency)}).`
      );
      return;
    }

    onSettle({
      debtId: debt.id,
      amountMinor: minor,
      paymentDate,
      sourceAccountId: selectedAccountId || undefined,
      notes: notes.trim() || undefined,
      createLinkedTransaction,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl ${
                isPayable ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {isPayable ? 'Régulariser une ardoise' : 'Encaisser un remboursement'}
              </h2>
              <span className="text-xs text-slate-400">{debt.counterpartyName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Debt Current Status Box */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Solde restant dû :</span>
            <span className="font-mono-numbers font-bold text-slate-100 text-sm">
              {formatMoney(debt.remainingAmountMinor, debt.currency)}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Montant total initial :</span>
            <span className="font-mono-numbers">{formatMoney(debt.totalAmountMinor, debt.currency)}</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Amount input & Quick buttons */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 font-medium flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span>Montant du versement (DZD) *</span>
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickAmount(0.5)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium cursor-pointer"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAmount(1)}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold cursor-pointer"
                >
                  Solde total
                </button>
              </div>
            </div>
            <input
              type="text"
              required
              placeholder="ex. 2000"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 font-mono-numbers min-h-[44px]"
            />
          </div>

          {/* Account selector */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              <span>{isPayable ? 'Prélever depuis le compte :' : 'Encaisser sur le compte :'}</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Checkbox: Create Phase 1 Transaction */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800/80">
            <input
              type="checkbox"
              id="syncTx"
              checked={createLinkedTransaction}
              onChange={(e) => setCreateLinkedTransaction(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-700 text-amber-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="syncTx" className="text-slate-300 text-xs cursor-pointer leading-tight">
              <span>Synchroniser avec mes opérations</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                {isPayable
                  ? 'Crée automatiquement une dépense dans ce compte pour mettre à jour votre solde disponible.'
                  : 'Crée automatiquement un revenu pour créditer votre solde disponible.'}
              </span>
            </label>
          </div>

          {/* Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date du versement</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Note sur ce versement (Optionnel)</span>
            </label>
            <input
              type="text"
              placeholder="ex. Reçu au comptoir, acompte semaine"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer min-h-[44px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              className={`flex-1 h-11 rounded-xl font-bold transition cursor-pointer min-h-[44px] ${
                isPayable
                  ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              Confirmer le versement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
