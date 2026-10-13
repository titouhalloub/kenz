import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Business, BusinessReport } from '../domain/types';

interface ReportBusinessModalProps {
  business: Business | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (businessId: string, reason: BusinessReport['reason'], details: string) => void;
}

export const ReportBusinessModal: React.FC<ReportBusinessModalProps> = ({
  business,
  isOpen,
  onClose,
  onSubmitReport,
}) => {
  const [reason, setReason] = useState<BusinessReport['reason']>('inaccurate_info');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !business) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim()) return;

    onSubmitReport(business.id, reason, details.trim());
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDetails('');
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100">Signaler ce commerce</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-center text-xs text-emerald-300">
            Merci. Votre signalement a été transmis à l'équipe de modération.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Commerce concerné :</span>
              <span className="text-xs font-semibold text-slate-200 block">{business.name}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Motif</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as BusinessReport['reason'])}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="inaccurate_info">Numéro ou horaires inexacts</option>
                <option value="closed_down">Établissement définitivement fermé</option>
                <option value="suspicious">Activité suspecte ou non conforme</option>
                <option value="duplicate">Fiche en doublon</option>
                <option value="other">Autre motif</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Détails</label>
              <textarea
                rows={3}
                placeholder="Précisez ce qui doit être corrigé..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition cursor-pointer min-h-[44px]"
              >
                Envoyer le signalement
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-11 rounded-xl border border-slate-800 text-slate-400 text-xs min-h-[44px]"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
