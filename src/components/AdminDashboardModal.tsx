import React, { useState } from 'react';
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
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  businesses = [],
  documents = [],
  reports = [],
  onReviewBusiness,
  onResolveReport,
}) => {
  const [activeTab, setActiveTab] = useState<'infra' | 'queue' | 'reports'>('queue');
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
