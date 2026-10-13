import React, { useState } from 'react';
import { X, PlusCircle, Store, User, Calendar, DollarSign, FileText, Phone } from 'lucide-react';
import { DebtEntry, DebtType, Business } from '../domain/types';
import { parseToMinorUnits, formatMoney } from '../domain/financialCalculations';

interface AddDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  businesses: Business[];
  onSave: (
    debtData: Omit<
      DebtEntry,
      'id' | 'remainingAmountMinor' | 'status' | 'payments' | 'createdAt' | 'updatedAt'
    >
  ) => void;
  preselectedBusiness?: Business | null;
}

export const AddDebtModal: React.FC<AddDebtModalProps> = ({
  isOpen,
  onClose,
  businesses,
  onSave,
  preselectedBusiness,
}) => {
  const [type, setType] = useState<DebtType>('payable');
  const [counterpartyName, setCounterpartyName] = useState(preselectedBusiness?.name || '');
  const [selectedBusinessId, setSelectedBusinessId] = useState(preselectedBusiness?.id || '');
  const [counterpartyPhone, setCounterpartyPhone] = useState(preselectedBusiness?.phone || '');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSelectBusiness = (bizId: string) => {
    setSelectedBusinessId(bizId);
    if (bizId) {
      const biz = businesses.find((b) => b.id === bizId);
      if (biz) {
        setCounterpartyName(biz.name);
        if (biz.phone) setCounterpartyPhone(biz.phone);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const minor = parseToMinorUnits(amountStr);
    if (minor <= 0) {
      setError('Veuillez saisir un montant supérieur à 0.');
      return;
    }

    if (!counterpartyName.trim()) {
      setError('Veuillez indiquer le nom du commerçant ou de la personne.');
      return;
    }

    onSave({
      userId: 'usr_local_1',
      businessId: selectedBusinessId || undefined,
      counterpartyName: counterpartyName.trim(),
      counterpartyPhone: counterpartyPhone.trim() || undefined,
      type,
      totalAmountMinor: minor,
      currency: 'DZD',
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Nouvelle entrée au Carnet Kredy</h2>
              <span className="text-xs text-slate-400">Phase 5 · Dette commerçant ou créance</span>
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

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Debt Type Selector */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Type d'engagement</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('payable')}
                className={`py-2.5 px-3 rounded-xl font-semibold border transition cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                  type === 'payable'
                    ? 'bg-rose-950/70 border-rose-600 text-rose-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-bold">Je dois (Dette)</span>
                <span className="text-[10px] text-slate-400 font-normal">Ardoise commerçant ou prêt reçu</span>
              </button>

              <button
                type="button"
                onClick={() => setType('receivable')}
                className={`py-2.5 px-3 rounded-xl font-semibold border transition cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                  type === 'receivable'
                    ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-bold">On me doit (Créance)</span>
                <span className="text-[10px] text-slate-400 font-normal">Prêt consenti à un proche</span>
              </button>
            </div>
          </div>

          {/* Link to Neighborhood Merchant (Optional) */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span>Associer un commerce du quartier (Optionnel)</span>
            </label>
            <select
              value={selectedBusinessId}
              onChange={(e) => handleSelectBusiness(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            >
              <option value="">-- Aucun commerce associé (Contact libre) --</option>
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name} ({biz.category})
                </option>
              ))}
            </select>
          </div>

          {/* Counterparty Name */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Nom du commerçant ou de la personne *</span>
            </label>
            <input
              type="text"
              required
              placeholder="ex. Épicerie El Baraka, Ami Mourad"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>Téléphone de contact (Optionnel)</span>
            </label>
            <input
              type="tel"
              placeholder="ex. 0550 12 34 56"
              value={counterpartyPhone}
              onChange={(e) => setCounterpartyPhone(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span>Montant initial (DZD) *</span>
            </label>
            <input
              type="text"
              required
              placeholder="ex. 4500 ou 4500.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 font-mono-numbers min-h-[44px]"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date d'échéance convenue (Optionnel)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 min-h-[44px]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Notes ou détail des achats</span>
            </label>
            <textarea
              rows={2}
              placeholder="ex. 2 packs de lait, semoule 10kg, café"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 resize-none"
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
              className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition cursor-pointer min-h-[44px]"
            >
              Enregistrer au carnet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
