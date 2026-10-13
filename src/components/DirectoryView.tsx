import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Phone,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Navigation,
  List,
  Map as MapIcon,
  X,
  Flag,
  BookOpen,
} from 'lucide-react';
import { Business, VerificationStatus, BusinessReport } from '../domain/types';
import { BusinessSubmissionModal } from './BusinessSubmissionModal';
import { ReportBusinessModal } from './ReportBusinessModal';

interface DirectoryViewProps {
  businesses: Business[];
  onSubmitBusiness: (
    data: Omit<Business, 'id' | 'verificationStatus' | 'createdAt' | 'documentsCount'>,
    documentFiles: Array<{ documentType: string; fileName: string; fileSizeBytes: number; mimeType: string }>
  ) => void;
  onSubmitReport: (businessId: string, reason: BusinessReport['reason'], details: string) => void;
  onOpenAddKredy?: (business: Business) => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  businesses,
  onSubmitBusiness,
  onSubmitReport,
  onOpenAddKredy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Modals state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [reportingBusiness, setReportingBusiness] = useState<Business | null>(null);

  const categories = [
    'all',
    'Plomberie & Dépannage',
    'Alimentation & Épicerie',
    'Santé & Pharmacie',
    'Mécanique & Entretien',
    'Électricité & Dépannage',
  ];

  // Filtering
  const filtered = businesses.filter((b) => {
    if (!b.isPublished) return false;
    if (selectedCategory !== 'all' && b.category !== selectedCategory) return false;
    if (onlyVerified && b.verificationStatus !== 'documents_verified' && b.verificationStatus !== 'location_confirmed') {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = b.name.toLowerCase().includes(q);
      const matchCat = b.category.toLowerCase().includes(q);
      const matchAddr = b.addressText.toLowerCase().includes(q);
      const matchDesc = (b.description || '').toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchAddr && !matchDesc) return false;
    }

    return true;
  });

  const getVerificationBadge = (status: VerificationStatus, details?: string) => {
    switch (status) {
      case 'documents_verified':
        return (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="font-semibold">Documents vérifiés</span>
          </div>
        );
      case 'location_confirmed':
        return (
          <div className="flex items-center gap-1.5 text-xs text-blue-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-semibold">Emplacement confirmé</span>
          </div>
        );
      case 'pending_review':
        return (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Examen en cours</span>
          </div>
        );
      case 'unverified':
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Non vérifié</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Commerces & Services de Quartier</h1>
          <p className="text-xs text-slate-400">
            Professionnels locaux vérifiés par pièces justificatives à Alger et environs.
          </p>
        </div>

        <button
          onClick={() => setIsSubmitModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer min-h-[44px]"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Inscrire un commerce</span>
          <span className="sm:hidden">Inscrire</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Rechercher un plombier, une supérette, un quartier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Filter and View Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        {/* Category Pills (Functional Buttons) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition min-h-[36px] cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat === 'all' ? 'Tous' : cat}
            </button>
          ))}
        </div>

        {/* View Mode & Verified Only Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOnlyVerified(!onlyVerified)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition border min-h-[36px] cursor-pointer flex items-center gap-1.5 ${
              onlyVerified
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Vérifiés</span>
          </button>

          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded text-xs transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                viewMode === 'list' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Vue Liste"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-1.5 rounded text-xs transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                viewMode === 'map' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Vue Carte"
            >
              <MapIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Carte interactive locale (Alger & Wilaya)</span>
            </span>
            <span className="font-mono-numbers text-[11px]">{filtered.length} points repérés</span>
          </div>

          {/* Interactive Visual Map Canvas */}
          <div className="relative w-full h-80 rounded-xl bg-slate-950 border border-slate-800/80 overflow-hidden flex items-center justify-center">
            {/* Background Map Grid & Roads representation */}
            <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#64748b" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {/* Mediterranean Sea outline curve */}
              <path d="M 0 100 Q 150 40 300 120 T 600 80" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
            </svg>

            {/* City watermark */}
            <div className="absolute top-3 left-4 text-xs font-bold text-slate-700 tracking-widest uppercase pointer-events-none">
              Baie d'Alger · Mer Méditerranée
            </div>

            {/* Business Markers on Map */}
            <div className="relative w-full h-full">
              {filtered.map((biz, idx) => {
                // Approximate coordinate offset into 0-100% position
                const posX = 20 + ((idx * 17 + 10) % 65);
                const posY = 25 + ((idx * 19 + 15) % 55);

                const isSelected = selectedBusiness?.id === biz.id;

                return (
                  <button
                    key={biz.id}
                    onClick={() => setSelectedBusiness(biz)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer focus:outline-none"
                    style={{ left: `${posX}%`, top: `${posY}%` }}
                    title={biz.name}
                  >
                    <div className="relative flex items-center justify-center">
                      {isSelected && (
                        <div className="absolute w-8 h-8 rounded-full bg-emerald-500/30 animate-ping pointer-events-none" />
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                          biz.verificationStatus === 'documents_verified'
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : biz.verificationStatus === 'location_confirmed'
                            ? 'bg-blue-500 text-slate-950 font-bold'
                            : 'bg-slate-700 text-slate-200'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                    </div>
                    <span className="hidden group-hover:block absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-[10px] text-white whitespace-nowrap z-20 shadow-md">
                      {biz.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Card Preview when pin clicked on Map */}
            {selectedBusiness && (
              <div className="absolute bottom-3 left-3 right-3 bg-slate-900/95 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-100 block truncate">
                    {selectedBusiness.name}
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate">
                    {selectedBusiness.addressText}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${selectedBusiness.phone}`}
                    className="p-2 rounded-lg bg-emerald-600 text-white min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setSelectedBusiness(null)}
                    className="p-2 text-slate-400 hover:text-slate-200 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/40 border border-slate-800 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-300">Aucun commerce trouvé</p>
          <p className="text-xs text-slate-500">
            Ajustez vos filtres de recherche ou inscrivez un nouveau commerce.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filtered.map((biz) => (
            <div
              key={biz.id}
              onClick={() => setSelectedBusiness(biz)}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3 hover:border-slate-700 transition cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">
                      {biz.category}
                    </span>
                    <h3 className="text-sm font-bold text-slate-100 line-clamp-1">{biz.name}</h3>
                  </div>
                  {getVerificationBadge(biz.verificationStatus, biz.verificationDetails)}
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {biz.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{biz.addressText}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{biz.openingHours}</span>
                  </div>

                  <a
                    href={`tel:${biz.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-emerald-400 font-medium hover:text-emerald-300 py-1 px-2 rounded-lg bg-emerald-950/40 border border-emerald-900/60"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Appeler</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Business Detail Modal Sheet */}
      {selectedBusiness && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-xs text-slate-500 block">{selectedBusiness.category}</span>
                <h2 className="text-base font-bold text-slate-100">{selectedBusiness.name}</h2>
              </div>
              <button
                onClick={() => setSelectedBusiness(null)}
                className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verification Status Explainer Card */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Statut de vérification</span>
                {getVerificationBadge(selectedBusiness.verificationStatus)}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {selectedBusiness.verificationDetails ||
                  'Aucun document justificatif officiel vérifié pour le moment.'}
              </p>
              <div className="text-[10px] text-slate-500 pt-1">
                Dernière confirmation des données : {selectedBusiness.lastConfirmedDate}
              </div>
            </div>

            {/* Address & Phone */}
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>{selectedBusiness.addressText}, {selectedBusiness.city}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Horaires : {selectedBusiness.openingHours}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="font-mono-numbers">{selectedBusiness.phone}</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Prestations & Services</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {selectedBusiness.description || 'Aucune description complémentaire.'}
              </p>
            </div>

            {/* Actions: Call, Noter Kredy & Report */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <a
                href={`tel:${selectedBusiness.phone}`}
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition min-h-[44px]"
              >
                <Phone className="w-4 h-4" />
                <span>Appeler</span>
              </a>

              {onOpenAddKredy && (
                <button
                  type="button"
                  onClick={() => {
                    const biz = selectedBusiness;
                    setSelectedBusiness(null);
                    onOpenAddKredy(biz);
                  }}
                  className="h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition min-h-[44px] cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Noter un Kredy</span>
                </button>
              )}

              <button
                onClick={() => {
                  setReportingBusiness(selectedBusiness);
                }}
                className="h-11 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition min-h-[44px] cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Signaler</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Submission Modal */}
      <BusinessSubmissionModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmit={onSubmitBusiness}
      />

      {/* Report Listing Modal */}
      <ReportBusinessModal
        business={reportingBusiness}
        isOpen={!!reportingBusiness}
        onClose={() => setReportingBusiness(null)}
        onSubmitReport={onSubmitReport}
      />
    </div>
  );
};
