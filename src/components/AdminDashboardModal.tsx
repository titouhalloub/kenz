import React, { useEffect, useState } from 'react';
import {
  Database,
  X,
  CheckCircle,
  AlertCircle,
  Server,
  ShieldCheck,
  Code,
  Lock,
  FileText,
  Check,
  Ban,
  Flag,
  MapPin,
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
} from '../services/supabase';
import { Business, BusinessDocument, BusinessReport, VerificationStatus } from '../domain/types';
import { formatMoney } from '../domain/financialCalculations';
import { getCatalogProduct } from '../domain/productCatalog';
import { PRICE_EXTENDED_WINDOW_DAYS, PRICE_FRESH_WINDOW_DAYS, priceLifecycle } from '../domain/priceWindow';
import { parsePriceCsv, toBaseUnitPrice } from '../domain/priceValidation';
import { loadPriceAdminData, reviewPriceObservation, stageAdminPrices, type PriceQueueStatus, type PendingPriceObservation, type PriceSourceHealth } from '../services/priceAdminStore';
import { loadCommunityModerationQueue, moderateCommunityComment, moderateCommunityPost, resolveCommunityReport, type CommunityModerationReport } from '../services/communityStore';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  businesses?: Business[];
  documents?: BusinessDocument[];
  reports?: BusinessReport[];
  onReviewBusiness?: (params: {
    businessId: string;
    reviewerId: string;
    newStatus: VerificationStatus;
    reasonCode: string;
    reviewerNotes?: string;
  }) => void;
  onResolveReport?: (reportId: string, status: 'resolved' | 'dismissed') => void;
  /** Open directly on the price review tab (used by the "Revue des prix" button in Settings). */
  initialTab?: 'prices';
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  businesses = [],
  documents = [],
  reports = [],
  onReviewBusiness,
  onResolveReport,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'infra' | 'queue' | 'reports' | 'community' | 'prices'>(initialTab ?? 'queue');
  const [priceStatus, setPriceStatus] = useState<PriceQueueStatus>('pending');
  const [reviewReason, setReviewReason] = useState('Vérifié contre la source citée.');
  const [manualForm, setManualForm] = useState({ slug: '', price: '', unit: '', date: new Date().toISOString().slice(0, 10), wilaya: '', reference: '', note: '' });
  const [importMessage, setImportMessage] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ rows: ReturnType<typeof parsePriceCsv>['rows']; errors: ReturnType<typeof parsePriceCsv>['errors'] } | null>(null);
  useEffect(() => {
    if (!isOpen || initialTab !== 'prices') return;
    setActiveTab('prices');
    let active = true;
    void loadPriceAdminData('pending').then((result) => {
      if (!active) return;
      if (result.success) {
        setPriceSources(result.data?.sources || []);
        setPendingPrices(result.data?.pending || []);
        setPriceQueueError('');
      } else setPriceQueueError(result.error || 'Accès réservé aux modérateurs.');
    });
    return () => { active = false; };
  }, [isOpen, initialTab]);
  const [communityQueue, setCommunityQueue] = useState<CommunityModerationReport[]>([]);
  const [communityQueueLoading, setCommunityQueueLoading] = useState(false);
  const [communityQueueError, setCommunityQueueError] = useState('');
  const [priceSources, setPriceSources] = useState<PriceSourceHealth[]>([]);
  const [pendingPrices, setPendingPrices] = useState<PendingPriceObservation[]>([]);
  const [priceQueueLoading, setPriceQueueLoading] = useState(false);
  const [priceQueueError, setPriceQueueError] = useState('');
  const [supabaseConfig, setSupabaseConfig] = useState(getStoredSupabaseConfig());
  const [connStatus, setConnStatus] = useState<{
    tested: boolean;
    success?: boolean;
    message?: string;
    loading?: boolean;
  }>({ tested: false });

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setConnStatus({ tested: false, loading: true });
    saveSupabaseConfig(supabaseConfig);
    const res = await testSupabaseConnection(supabaseConfig);
    setConnStatus({ tested: true, success: res.success, message: res.message, loading: false });
  };


  const openCommunityModeration = async () => {
    setActiveTab('community');
    setCommunityQueueLoading(true);
    setCommunityQueueError('');
    const result = await loadCommunityModerationQueue();
    if (result.success) setCommunityQueue(result.data || []);
    else setCommunityQueueError(result.error || 'Accès réservé aux modérateurs communautaires.');
    setCommunityQueueLoading(false);
  };

  const handleCommunityDecision = async (report: CommunityModerationReport, decision: 'hide' | 'dismiss') => {
    setCommunityQueueError('');
    if (decision === 'hide') {
      const moderation = report.targetType === 'post'
        ? await moderateCommunityPost(report.targetId, 'hidden', 'Masqué après examen du signalement.')
        : await moderateCommunityComment(report.targetId, 'hidden', 'Masqué après examen du signalement.');
      if (!moderation.success) {
        setCommunityQueueError(moderation.error || 'Action de modération impossible.');
        return;
      }
    }
    const resolved = await resolveCommunityReport(
      report.id, decision === 'hide' ? 'resolved' : 'dismissed',
      decision === 'hide' ? 'Contenu masqué après examen.' : 'Signalement examiné et classé sans suite.',
    );
    if (!resolved.success) {
      setCommunityQueueError(resolved.error || 'Impossible de clôturer le signalement.');
      return;
    }
    setCommunityQueue((current) => current.filter((row) => row.id !== report.id));
  };


  const openPriceAdmin = async (status: PriceQueueStatus = priceStatus) => {
    setActiveTab('prices');
    setPriceStatus(status);
    setPriceQueueLoading(true);
    setPriceQueueError('');
    const result = await loadPriceAdminData(status);
    if (result.success) {
      setPriceSources(result.data?.sources || []);
      setPendingPrices(result.data?.pending || []);
    } else {
      setPriceQueueError(result.error || 'Accès réservé aux modérateurs.');
    }
    setPriceQueueLoading(false);
  };

  const handlePriceDecision = async (row: PendingPriceObservation, decision: 'accepted' | 'rejected') => {
    setPriceQueueError('');
    const reason = reviewReason.trim();
    if (!reason) {
      setPriceQueueError('Indiquez la raison de votre décision (elle est conservée dans l’historique).');
      return;
    }
    const result = await reviewPriceObservation(row.observation_id, decision, reason);
    if (!result.success) {
      setPriceQueueError(result.error || 'La revue du prix a échoué.');
      return;
    }
    await openPriceAdmin();
  };

  /** Channel 2: one manual entry. The price is typed per catalog unit (kg/l/unit) or g/ml; everything lands as PENDING. */
  const handleManualPrice = async () => {
    setImportMessage('');
    const product = getCatalogProduct(manualForm.slug.trim());
    const amount = Number(manualForm.price.replace(',', '.'));
    if (!product || !Number.isFinite(amount) || amount <= 0) {
      setImportMessage('Produit (identifiant du catalogue) et prix valides requis.');
      return;
    }
    const perBase = toBaseUnitPrice(Math.round(amount * 100), manualForm.unit.trim() || product.baseUnit, product.baseUnit);
    if (perBase === null) {
      setImportMessage(`Unité incompatible : ${product.nameFr} se compte en ${product.baseUnit}.`);
      return;
    }
    setImportBusy(true);
    const result = await stageAdminPrices([{
      productSlug: product.slug, unitPriceMinor: perBase, observedAt: manualForm.date,
      wilayaCode: manualForm.wilaya || null, sourceReference: manualForm.reference, note: manualForm.note || null,
    }]);
    setImportBusy(false);
    if (!result.success) { setImportMessage(result.error || 'Échec.'); return; }
    const failure = result.data?.failed[0];
    setImportMessage(failure ? `Refusé : ${failure.message}` : 'Prix ajouté à la file « en attente ». Il n’est pas publié tant qu’il n’est pas accepté.');
    if (!failure) void openPriceAdmin('pending');
  };

  /** CSV is parsed first; no database write occurs until the operator confirms the preview. */
  const handleCsvFile = async (file: File | undefined) => {
    setImportMessage('');
    setCsvPreview(null);
    if (!file) return;
    if (file.size > 500_000) { setImportMessage('Fichier trop volumineux (500 Ko max).'); return; }
    try {
      const parsed = parsePriceCsv(await file.text());
      setCsvPreview(parsed);
      setImportMessage('');
    } catch {
      setImportMessage('Impossible de lire ce fichier CSV.');
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || csvPreview.rows.length === 0 || importBusy) return;
    setImportBusy(true);
    const staged = await stageAdminPrices(csvPreview.rows);
    setImportBusy(false);
    if (!staged.success) {
      setImportMessage(staged.error || 'Échec de l’import.');
      return;
    }
    const failed = staged.data?.failed.length ?? 0;
    const added = staged.data?.staged ?? 0;
    setImportMessage(`${added} prix ajoutés en attente · ${failed + csvPreview.errors.length} lignes refusées ou ignorées.`);
    setCsvPreview(null);
    if (added) void openPriceAdmin('pending');
  };

  const pendingBusinesses = businesses.filter((b) => b.verificationStatus === 'pending_review');
  const pendingReports = reports.filter((r) => r.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Console d'Administration & Modération</h2>
              <span className="text-[11px] text-slate-400">Opérateurs · Vérification de documents · RLS Backend</span>
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

        {/* Segmented Tab Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-slate-800 text-amber-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Dossiers à vérifier</span>
            {pendingBusinesses.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono-numbers">
                {pendingBusinesses.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'reports'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Signalements</span>
            {pendingReports.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-mono-numbers">
                {pendingReports.length}
              </span>
            )}
          </button>

          <button
            onClick={() => void openCommunityModeration()}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'community' ? 'bg-slate-800 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Modération communauté</span>
            {communityQueue.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300">{communityQueue.length}</span>}
          </button>

          <button
            onClick={() => void openPriceAdmin()}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'prices' ? 'bg-slate-800 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Prix & Sources</span>
            {pendingPrices.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300">{pendingPrices.length}</span>}
          </button>

          <button
            onClick={() => setActiveTab('infra')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'infra'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Infrastructure Supabase</span>
          </button>
        </div>

        {/* TAB 1: REVIEW QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>File de vérification des documents (CNRC / Cartes Pro)</span>
              <span>{pendingBusinesses.length} en attente</span>
            </div>

            {pendingBusinesses.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950 border border-slate-800/80 text-center text-xs text-slate-400">
                Aucun dossier en attente d'audit pour le moment.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingBusinesses.map((biz) => {
                  const bizDocs = documents.filter((d) => d.businessId === biz.id);

                  return (
                    <div
                      key={biz.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-semibold text-slate-400 block">{biz.category}</span>
                          <h3 className="text-sm font-bold text-slate-100">{biz.name}</h3>
                          <span className="text-[11px] text-slate-400 block">{biz.addressText}</span>
                        </div>
                        <span className="text-[11px] font-mono-numbers text-amber-400 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-900/60">
                          {biz.verificationStatus}
                        </span>
                      </div>

                      {/* Documents list */}
                      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-3 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-300 block">
                          Pièces justificatives déposées ({bizDocs.length}) :
                        </span>
                        {bizDocs.length === 0 ? (
                          <span className="text-[11px] text-slate-500">Aucun document joint</span>
                        ) : (
                          bizDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between text-xs text-slate-300 py-1 border-b border-slate-800/50 last:border-0"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono-numbers shrink-0">
                                {doc.documentType} · {(doc.fileSizeBytes / 1024).toFixed(0)} Ko
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Decision actions */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() =>
                            onReviewBusiness?.({
                              businessId: biz.id,
                              reviewerId: 'admin_agent',
                              newStatus: 'documents_verified',
                              reasonCode: 'DOCS_CNRC_VALIDATED',
                              reviewerNotes: 'Document CNRC et carte professionnelle validés.',
                            })
                          }
                          className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Valider documents</span>
                        </button>

                        <button
                          onClick={() =>
                            onReviewBusiness?.({
                              businessId: biz.id,
                              reviewerId: 'admin_agent',
                              newStatus: 'location_confirmed',
                              reasonCode: 'LOCATION_PHYSICAL_CHECK',
                              reviewerNotes: 'Local physique confirmé sur place.',
                            })
                          }
                          className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Confirmer lieu</span>
                        </button>

                        <button
                          onClick={() =>
                            onReviewBusiness?.({
                              businessId: biz.id,
                              reviewerId: 'admin_agent',
                              newStatus: 'rejected',
                              reasonCode: 'DOCS_INVALID_EXPIRED',
                              reviewerNotes: 'Document expiré ou illisible.',
                            })
                          }
                          className="h-9 px-3 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Rejeter</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COMMUNITY REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Signalements transmis par les utilisateurs</span>
              <span>{reports.length} signalement{reports.length > 1 ? 's' : ''}</span>
            </div>

            {reports.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950 border border-slate-800/80 text-center text-xs text-slate-400">
                Aucun signalement en attente.
              </div>
            ) : (
              <div className="space-y-2.5">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{rep.businessName}</span>
                      <span
                        className={`text-[10px] font-mono-numbers px-2 py-0.5 rounded ${
                          rep.status === 'pending'
                            ? 'bg-amber-950/60 text-amber-300'
                            : 'bg-emerald-950/60 text-emerald-300'
                        }`}
                      >
                        {rep.status}
                      </span>
                    </div>

                    <div className="text-slate-400">
                      <strong className="text-slate-300">Motif :</strong> {rep.reason}
                    </div>
                    <p className="text-slate-400 leading-relaxed bg-slate-900 p-2 rounded">
                      "{rep.details}"
                    </p>

                    {rep.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => onResolveReport?.(rep.id, 'resolved')}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-medium text-xs hover:bg-emerald-500"
                        >
                          Marquer traité
                        </button>
                        <button
                          onClick={() => onResolveReport?.(rep.id, 'dismissed')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                        >
                          Rejeter
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'community' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Signalements des publications et commentaires</span>
              <button onClick={() => void openCommunityModeration()} className="text-emerald-300">Actualiser</button>
            </div>
            {communityQueueLoading && <p className="p-5 text-center text-xs text-slate-400">Chargement…</p>}
            {communityQueueError && <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">{communityQueueError}</p>}
            {!communityQueueLoading && !communityQueueError && communityQueue.length === 0 && (
              <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">Aucun signalement communautaire en attente.</div>
            )}
            {communityQueue.map((report) => (
              <div key={report.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{report.targetType === 'post' ? 'Publication' : 'Commentaire'} · {report.reason}</span>
                  <span className="text-[10px] text-slate-500">{new Date(report.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-900 p-2 text-xs text-slate-300">{report.targetText}</p>
                {report.details && <p className="text-[11px] text-slate-400">Détail : {report.details}</p>}
                <div className="flex gap-2">
                  <button onClick={() => void handleCommunityDecision(report, 'hide')} className="flex-1 rounded-lg bg-rose-700 px-3 py-2 text-xs text-white">Masquer le contenu</button>
                  <button onClick={() => void handleCommunityDecision(report, 'dismiss')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Classer sans suite</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Sources publiques et prix en attente de validation</span>
              <button onClick={() => void openPriceAdmin()} className="text-emerald-300">Actualiser</button>
            </div>
            {priceQueueLoading && <p className="p-5 text-center text-xs text-slate-400">Chargement…</p>}
            {priceQueueError && <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">{priceQueueError}</p>}
            {!priceQueueLoading && !priceQueueError && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {priceSources.map((source) => (
                    <div key={source.source_id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200">{source.source_name}</span>
                        <span className={`text-[9px] rounded px-2 py-0.5 ${source.enabled && source.reviewed ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{source.enabled && source.reviewed ? 'Activée' : 'Désactivée'}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{source.source_type} · {source.schedule || 'manuel'}</p>
                      <p className="text-[10px] text-slate-400">Dernier passage : {source.last_run_at ? new Date(source.last_run_at).toLocaleString() : 'Jamais'} · {source.last_run_status || '—'}</p>
                      <p className="text-[10px] text-slate-400">Lignes : {source.last_rows_parsed ?? 0} analysées / {source.last_rows_accepted ?? 0} acceptées · {source.pending_observations} en attente</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-[11px] text-slate-400">
                  <p className="font-semibold text-slate-200">Comment fonctionnent les prix</p>
                  <p>Officiel, import administrateur et contributions de la communauté arrivent tous ici comme <b>en attente</b>. Seul un prix <b>accepté</b> (« vérifié ») alimente les moyennes du simulateur. Un prix saisi par un utilisateur dans le simulateur reste une <b>estimation manuelle</b> et n’apparaît jamais ici.</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-200">Ajouter des prix (import administrateur)</h3>
                  <p className="text-[10px] text-slate-500">Une source citée est obligatoire. Les prix ajoutés restent « en attente » jusqu’à votre acceptation. Nécessite que la source « admin-manual-import » soit activée.</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <input value={manualForm.slug} onChange={(e) => setManualForm({ ...manualForm, slug: e.target.value })} placeholder="produit (ex. tomate)" className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                    <input value={manualForm.price} onChange={(e) => setManualForm({ ...manualForm, price: e.target.value })} inputMode="decimal" placeholder="prix DA" className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                    <input value={manualForm.unit} onChange={(e) => setManualForm({ ...manualForm, unit: e.target.value })} placeholder="unité (kg, l, unit, g, ml)" className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                    <input value={manualForm.wilaya} onChange={(e) => setManualForm({ ...manualForm, wilaya: e.target.value })} placeholder="wilaya (ex. 15) ou vide = national" className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                    <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                    <input value={manualForm.reference} onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })} placeholder="source (lien https ou bulletin)" className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-slate-100" />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={importBusy} onClick={() => void handleManualPrice()} className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-40">Ajouter en attente</button>
                    <label className="flex-1 cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-center text-xs text-slate-200">
                      Importer un CSV
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void handleCsvFile(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500">CSV : product_slug, unit_price, observed_at, unit, wilaya_code, source_reference, note</p>
                  {csvPreview && (
                    <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-200">Aperçu avant import</p>
                      <p className="text-[11px] text-slate-200">{csvPreview.rows.length} lignes lisibles · {csvPreview.errors.length} lignes rejetées à la lecture. Aucun prix n’a encore été enregistré.</p>
                      {csvPreview.errors.slice(0, 8).map((error, index) => (
                        <p key={`csv-error-${index}`} className="text-[10px] text-rose-300">Ligne {error.line} : {error.message}</p>
                      ))}
                      {csvPreview.rows.slice(0, 8).map((row, index) => (
                        <p key={`csv-row-${index}`} className="text-[10px] text-slate-300">{row.productSlug} · {(row.unitPriceMinor / 100).toLocaleString('fr-DZ')} DA · {new Date(row.observedAt).toLocaleDateString()} · {row.wilayaCode || 'National'} · {row.sourceReference || 'Source manquante'}</p>
                      ))}
                      {csvPreview.rows.length > 8 && <p className="text-[10px] text-slate-500">… et {csvPreview.rows.length - 8} autres lignes.</p>}
                      <div className="flex gap-2 pt-1">
                        <button disabled={importBusy || csvPreview.rows.length === 0} onClick={() => void handleConfirmCsvImport()} className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-40">{importBusy ? 'Import en cours…' : 'Confirmer l’import en attente'}</button>
                        <button disabled={importBusy} onClick={() => setCsvPreview(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Annuler</button>
                      </div>
                    </div>
                  )}
                  {importMessage && <p className="rounded-md bg-slate-900 p-2 text-[11px] text-slate-200">{importMessage}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-200">Prix ({pendingPrices.length})</h3>
                    <div className="flex gap-1">
                      {([['pending', 'En attente'], ['accepted', 'Vérifiés'], ['rejected', 'Rejetés']] as const).map(([value, label]) => (
                        <button key={value} onClick={() => void openPriceAdmin(value)} className={`rounded-full px-3 py-1 text-[11px] ${priceStatus === value ? 'bg-emerald-700 text-white' : 'border border-slate-700 text-slate-300'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {priceStatus === 'pending' && (
                    <label className="block text-[10px] text-slate-400">Raison de la décision (enregistrée avec chaque acceptation ou rejet)
                      <input value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-xs text-slate-100" />
                    </label>
                  )}
                  {pendingPrices.length === 0 ? (
                    <p className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-center text-xs text-slate-400">{priceStatus === 'pending' ? 'Aucun prix en attente.' : priceStatus === 'accepted' ? 'Aucun prix vérifié.' : 'Aucun prix rejeté.'}</p>
                  ) : pendingPrices.map((row) => {
                    const catalogUnit = row.base_unit || getCatalogProduct(row.product_slug)?.baseUnit;
                    const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(row.observed_at)) / 86_400_000));
                    const lifecycle = priceLifecycle(row.status ?? priceStatus, row.observed_at, new Date());
                    const expired = lifecycle === 'expired';
                    const aging = !expired && ageDays > PRICE_FRESH_WINDOW_DAYS;
                    const lifecycleLabel = { pending: 'En attente', verified: 'Vérifié', rejected: 'Rejeté', expired: 'Expiré' }[lifecycle];
                    const lifecycleStyle = { pending: 'bg-amber-950 text-amber-300', verified: 'bg-emerald-950 text-emerald-300', rejected: 'bg-rose-950 text-rose-300', expired: 'bg-slate-800 text-slate-400' }[lifecycle];
                    return (
                    <div key={row.observation_id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-xs font-semibold text-slate-100">{row.product_name} <span className={`ml-1 rounded px-1.5 py-0.5 text-[9px] ${lifecycleStyle}`}>{lifecycleLabel}</span></p><p className="text-[10px] text-slate-500">{row.source_name}{row.source_type ? ` (${row.source_type})` : ''} · {row.wilaya_code ? `Wilaya ${row.wilaya_code}` : 'National'}</p></div>
                        <span className="text-sm font-bold text-emerald-300">{formatMoney(row.unit_price_minor, 'DZD', 'fr')}{catalogUnit ? ` / ${catalogUnit === 'unit' ? 'unité' : catalogUnit}` : ''}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Observé : {new Date(row.observed_at).toLocaleDateString()} ({ageDays} j) · {row.quality_flags.join(', ') || 'Aucun drapeau'}</p>
                      {expired && <p className="rounded-md bg-rose-950/40 p-2 text-[10px] text-rose-200">Relevé de plus de {PRICE_EXTENDED_WINDOW_DAYS} jours : l’accepter ne le publiera pas dans les moyennes. Rejetez-le ou attendez un relevé récent.</p>}
                      {aging && <p className="rounded-md bg-amber-950/40 p-2 text-[10px] text-amber-200">Relevé de plus de {PRICE_FRESH_WINDOW_DAYS} jours : il sera publié comme « ancien » avec sa date.</p>}
                      {row.source_reference && <p className="text-[10px] text-slate-500">{row.source_reference}</p>}
                      {row.evidence_url && <a href={row.evidence_url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-emerald-300 underline">Preuve fournie ↗</a>}
                      {row.note && <p className="text-[10px] text-slate-400">Note : {row.note}</p>}
                      {row.review_reason && <p className="text-[10px] text-slate-500">Décision : {row.review_reason}</p>}
                      {priceStatus === 'pending' && (
                        <div className="flex gap-2">
                          <button disabled={expired} onClick={() => void handlePriceDecision(row, 'accepted')} className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-40">Accepter</button>
                          <button onClick={() => void handlePriceDecision(row, 'rejected')} className="flex-1 rounded-lg border border-rose-900/60 px-3 py-2 text-xs text-rose-300">Rejeter</button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: INFRASTRUCTURE SUPABASE */}
        {activeTab === 'infra' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-400" />
                  État Backend Supabase PostgreSQL
                </span>
                <span className="text-[11px] font-mono-numbers text-slate-500">v15+ RLS Enforced</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL du Projet Supabase
                </label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={supabaseConfig.url}
                  onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value })}
                  className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Clé Publique Anonyme (Anon Key)
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseConfig.anonKey}
                  onChange={(e) => setSupabaseConfig({ ...supabaseConfig, anonKey: e.target.value })}
                  className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              {connStatus.tested && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    connStatus.success
                      ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-800/80 text-rose-300'
                  }`}
                >
                  {connStatus.success ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{connStatus.message}</span>
                </div>
              )}

              <button
                onClick={handleTestConnection}
                disabled={connStatus.loading}
                className="w-full h-11 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
              >
                {connStatus.loading ? 'Test en cours...' : 'Sauvegarder & Tester la connexion'}
              </button>
            </div>

            {/* Migrations overview */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Code className="w-4 h-4 text-blue-400" />
                <span>Migrations SQL Versionnées</span>
              </div>
              <ul className="text-xs font-mono space-y-1 text-slate-400">
                <li className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  supabase/migrations/001_phase1_budget_mvp.sql (Budgets, RLS)
                </li>
                <li className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  supabase/migrations/002_phase2_neighborhood_directory.sql (Directory, Docs, Audit)
                </li>
                <li className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  supabase/migrations/003_phase4_ai_credits_and_ledger.sql (AI Credits, Usage Ledger)
                </li>
                <li className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  supabase/migrations/004_phase5_debt_ledger_and_analytics.sql (Carnet Kredy, Debts, Health Score)
                </li>
              </ul>
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer min-h-[44px]"
          >
            Fermer la console
          </button>
        </div>
      </div>
    </div>
  );
};
