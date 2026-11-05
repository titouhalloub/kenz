import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ScanLine, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Account, Category, TransactionType, UserProfile } from '../domain/types';
import { parseToMinorUnits } from '../domain/financialCalculations';
import { getSupabaseAccessToken } from '../services/supabase';

interface ReceiptScanResult {
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  categoryHint: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  profile: UserProfile;
  availableCredits: number;
  onCreditsUpdated: (balance: number) => void;
  onSave: (data: {
    accountId: string;
    type: TransactionType;
    amountMinor: number;
    currency: string;
    categoryId?: string;
    transactionDate: string;
    description?: string;
  }) => void;
}

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function compressReceipt(file: File): Promise<{ data: string; mimeType: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez un fichier image.');
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Impossible de lire cette image.'));
    });
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Traitement image indisponible sur cet appareil.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Compression de l’image impossible.')), 'image/jpeg', 0.82);
    });
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
      reader.readAsDataURL(blob);
    });
    return { data, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen, onClose, accounts, categories, profile, availableCredits, onCreditsUpdated, onSave,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [scan, setScan] = useState<ReceiptScanResult | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(profile.preferredCurrency);
  const [accountId, setAccountId] = useState(accounts.find((item) => !item.isArchived)?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);

  if (!isOpen) return null;

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    setScan(null);
    setScanned(false);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setScan(null);
    setScanned(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      if (availableCredits < 20) throw new Error('Crédits IA insuffisants. Il faut 20 crédits pour analyser un reçu.');
      const image = await compressReceipt(file);
      const accessToken = await getSupabaseAccessToken();
      const response = await fetch('/api/ai/receipt-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ...image, currency: profile.preferredCurrency }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Analyse du reçu impossible.');
      const result = payload.receipt as ReceiptScanResult;
      setScan(result);
      setAmount(String(result.amount ?? ''));
      setDate(/^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : today());
      setMerchant(result.merchant || '');
      setDescription(result.description || result.merchant || 'Achat');
      setCurrency(result.currency || profile.preferredCurrency);
      setAccountId(accounts.find((item) => !item.isArchived && item.currency === (result.currency || profile.preferredCurrency))?.id || '');
      const matchingCategory = categories.find((category) =>
        !category.isIncome && result.categoryHint &&
        (category.name.toLocaleLowerCase().includes(result.categoryHint.toLocaleLowerCase()) ||
         result.categoryHint.toLocaleLowerCase().includes(category.name.toLocaleLowerCase()))
      );
      setCategoryId(matchingCategory?.id || categories.find((category) => !category.isIncome)?.id || '');
      if (typeof payload.balanceCredits === 'number') onCreditsUpdated(payload.balanceCredits);
      setScanned(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur inattendue pendant l’analyse.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    const amountMinor = parseToMinorUnits(amount);
    if (!accountId || amountMinor <= 0 || !date) {
      setError('Vérifiez le compte, le montant et la date avant d’enregistrer.');
      return;
    }
    const account = accounts.find((item) => item.id === accountId);
    if (!account || account.currency !== currency) {
      setError('La devise du reçu doit correspondre à celle du compte sélectionné.');
      return;
    }
    onSave({
      accountId,
      type: 'expense',
      amountMinor,
      currency,
      categoryId: categoryId || undefined,
      transactionDate: date,
      description: description.trim() || merchant.trim() || 'Achat par reçu',
    });
    clearImage();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2"><ScanLine className="w-5 h-5 text-emerald-400" /> Scanner un reçu</h2>
            <p className="text-[11px] text-slate-400 mt-1">Analyse IA · 20 crédits par reçu · aucune image enregistrée par Kenz</p>
          </div>
          <button onClick={() => { clearImage(); onClose(); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white" aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>

        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />

        {!preview ? (
          <div className="grid grid-cols-2 gap-3 py-6">
            <button onClick={() => { if (fileInput.current) { fileInput.current.setAttribute('capture', 'environment'); fileInput.current.click(); } }} className="min-h-32 rounded-2xl border border-emerald-700/70 bg-emerald-950/30 flex flex-col items-center justify-center gap-2 text-emerald-300 hover:bg-emerald-950/60">
              <Camera className="w-7 h-7" /><span className="text-sm font-semibold">Prendre une photo</span>
            </button>
            <button onClick={() => { if (fileInput.current) { fileInput.current.removeAttribute('capture'); fileInput.current.click(); } }} className="min-h-32 rounded-2xl border border-slate-700 bg-slate-950/60 flex flex-col items-center justify-center gap-2 text-slate-200 hover:bg-slate-800">
              <ImagePlus className="w-7 h-7" /><span className="text-sm font-semibold">Choisir une image</span>
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <img src={preview} alt="Aperçu du reçu" className="w-full max-h-56 object-contain" />
              <button onClick={clearImage} className="absolute top-2 right-2 rounded-lg bg-slate-950/90 p-2 text-white" aria-label="Retirer l’image"><X className="w-4 h-4" /></button>
            </div>
            {busy && <div className="flex items-center justify-center gap-2 py-4 text-sm text-emerald-300"><Loader2 className="w-4 h-4 animate-spin" /> Lecture du reçu en cours…</div>}
            {error && <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
            {scanned && scan && (
              <>
                <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3 text-xs text-emerald-200 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Extraction terminée ({scan.confidence}). Vérifiez chaque champ : l’IA peut se tromper.</span>
                </div>
                {scan.notes?.length > 0 && <p className="text-[11px] text-amber-300">{scan.notes.join(' · ')}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-300">Montant ({currency})<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white" /></label>
                  <label className="text-xs text-slate-300">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white" /></label>
                  <label className="text-xs text-slate-300 col-span-2">Marchand<input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white" /></label>
                  <label className="text-xs text-slate-300 col-span-2">Description<input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white" /></label>
                  <label className="text-xs text-slate-300">Compte<select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white">{accounts.filter((item) => !item.isArchived && item.currency === currency).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label className="text-xs text-slate-300">Catégorie<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-slate-950 border border-slate-700 px-3 text-white">{categories.filter((item) => !item.isIncome).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <button onClick={handleSave} className="w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Confirmer et créer la dépense</button>
              </>
            )}
            {!busy && !scanned && !error && <p className="text-xs text-slate-400 text-center py-3">Préparation de l’image…</p>}
          </div>
        )}
        <p className="mt-4 text-[10px] leading-relaxed text-slate-500">L’image est envoyée à Google Gemini pour analyse, puis n’est pas enregistrée par Kenz. Fermer cet écran efface l’aperçu local. Aucune transaction n’est créée avant votre confirmation.</p>
      </div>
    </div>
  );
};
