/**
 * Neighborhood Directory Store Service
 * Manages local businesses, private verification documents, reviewer audit trails, and community reports.
 */

import {
  Business,
  BusinessDocument,
  VerificationReview,
  BusinessReport,
  VerificationStatus,
} from '../domain/types';

const DIRECTORY_STORAGE_KEY = 'kenz_directory_state_v1';

export interface DirectoryState {
  businesses: Business[];
  documents: BusinessDocument[];
  reviews: VerificationReview[];
  reports: BusinessReport[];
}

// Initial realistic baseline businesses across Algerian districts with honest verification states
const INITIAL_BUSINESSES: Business[] = [
  {
    id: 'biz_1',
    ownerId: 'owner_dz_1',
    name: 'Plomberie & Chauffage El Bahdja',
    category: 'Plomberie & Dépannage',
    description: 'Dépannage d’urgence fuite d’eau, installation chauffe-eau, chaudière et sanitaires.',
    phone: '+213 555 12 34 56',
    addressText: '14 Rue Didouche Mourad, Alger Centre',
    city: 'Alger',
    latitude: 36.7725,
    longitude: 3.0588,
    openingHours: '08:00 - 20:00 (7j/7)',
    verificationStatus: 'documents_verified',
    verificationDetails: 'Registre de commerce CNRC n° 16/00-12849 et carte artisanale validés.',
    lastConfirmedDate: '2026-10-01',
    isPublished: true,
    documentsCount: 2,
    createdAt: '2026-09-15T09:00:00Z',
  },
  {
    id: 'biz_2',
    ownerId: 'owner_dz_2',
    name: 'Superette Le Palmier (Alimentation Générale)',
    category: 'Alimentation & Épicerie',
    description: 'Produits frais, crémerie, conserves et boissons locales. Prix du marché affichés.',
    phone: '+213 21 63 45 78',
    addressText: '28 Boulevard Colonel Amirouche, Bab El Oued',
    city: 'Alger',
    latitude: 36.7891,
    longitude: 3.0532,
    openingHours: '06:30 - 23:00 (Tous les jours)',
    verificationStatus: 'location_confirmed',
    verificationDetails: 'Local physique et coordonnées GPS confirmés sur place.',
    lastConfirmedDate: '2026-10-08',
    isPublished: true,
    documentsCount: 1,
    createdAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 'biz_3',
    ownerId: 'owner_dz_3',
    name: 'Pharmacie Ibn Sina',
    category: 'Santé & Pharmacie',
    description: 'Médicaments remboursables Chifa, parapharmacie et matériel médical à domicile.',
    phone: '+213 21 28 90 12',
    addressText: '5 Avenue des Frères Bouadou, Bir Mourad Raïs',
    city: 'Alger',
    latitude: 36.7368,
    longitude: 3.0515,
    openingHours: '08:00 - 21:00 (Garde alternée)',
    verificationStatus: 'documents_verified',
    verificationDetails: 'Agrément ministériel de santé et diplôme de pharmacien vérifiés.',
    lastConfirmedDate: '2026-10-10',
    isPublished: true,
    documentsCount: 2,
    createdAt: '2026-09-25T14:00:00Z',
  },
  {
    id: 'biz_4',
    ownerId: 'owner_dz_4',
    name: 'Garage Mécanique Express Auto',
    category: 'Mécanique & Entretien',
    description: 'Diagnostic électronique multimarque, vidange rapide, freins et suspension.',
    phone: '+213 560 99 88 77',
    addressText: 'Zone d’Activité, Route de Dar El Beïda',
    city: 'Alger',
    latitude: 36.7123,
    longitude: 3.2120,
    openingHours: '08:00 - 18:00 (Sam - Jeu)',
    verificationStatus: 'pending_review',
    verificationDetails: 'Dossier déposé avec registre CNRC — examen en cours par le modérateur.',
    lastConfirmedDate: '2026-10-12',
    isPublished: true,
    documentsCount: 1,
    createdAt: '2026-10-11T16:00:00Z',
  },
  {
    id: 'biz_5',
    ownerId: 'owner_dz_5',
    name: 'Électricien Bâtiment & Réseau',
    category: 'Électricité & Dépannage',
    description: 'Remise aux normes tableaux électriques, dépannage court-circuit, interphonie.',
    phone: '+213 770 44 33 22',
    addressText: 'Cité 1500 Logements, Kouba',
    city: 'Alger',
    latitude: 36.7214,
    longitude: 3.0782,
    openingHours: '08:00 - 19:00',
    verificationStatus: 'unverified',
    verificationDetails: 'Fiche déclarative non encore auditée.',
    lastConfirmedDate: '2026-10-05',
    isPublished: true,
    documentsCount: 0,
    createdAt: '2026-10-05T11:00:00Z',
  },
];

const INITIAL_STATE: DirectoryState = {
  businesses: INITIAL_BUSINESSES,
  documents: [
    {
      id: 'doc_1',
      businessId: 'biz_1',
      documentType: 'Registre de Commerce (CNRC)',
      fileName: 'registre_commerce_cnrc_2026.pdf',
      fileSizeBytes: 1420500,
      mimeType: 'application/pdf',
      status: 'verified',
      uploadedAt: '2026-09-15T09:30:00Z',
    },
    {
      id: 'doc_2',
      businessId: 'biz_3',
      documentType: 'Agrément Pharmaceutique',
      fileName: 'agrement_officine_ibnsina.pdf',
      fileSizeBytes: 980200,
      mimeType: 'application/pdf',
      status: 'verified',
      uploadedAt: '2026-09-25T14:20:00Z',
    },
    {
      id: 'doc_3',
      businessId: 'biz_4',
      documentType: 'Registre de Commerce (CNRC)',
      fileName: 'cnrc_express_auto_attestation.pdf',
      fileSizeBytes: 2100400,
      mimeType: 'application/pdf',
      status: 'pending',
      uploadedAt: '2026-10-11T16:15:00Z',
    },
  ],
  reviews: [
    {
      id: 'rev_1',
      businessId: 'biz_1',
      reviewerId: 'admin_reviewer_1',
      previousStatus: 'pending_review',
      newStatus: 'documents_verified',
      reasonCode: 'DOCS_VALID_CNRC',
      reviewerNotes: 'Numéro CNRC vérifié conforme au registre du commerce national.',
      reviewedAt: '2026-09-16T11:00:00Z',
    },
  ],
  reports: [],
};

export function loadDirectoryState(): DirectoryState {
  if (typeof localStorage === 'undefined') return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(INITIAL_STATE));
      return INITIAL_STATE;
    }
    const parsed = JSON.parse(raw);
    return {
      businesses: parsed.businesses?.length ? parsed.businesses : INITIAL_STATE.businesses,
      documents: parsed.documents?.length ? parsed.documents : INITIAL_STATE.documents,
      reviews: parsed.reviews || [],
      reports: parsed.reports || [],
    };
  } catch {
    return INITIAL_STATE;
  }
}

export function saveDirectoryState(state: DirectoryState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save directory state', e);
  }
}

export function submitBusiness(
  currentState: DirectoryState,
  data: Omit<Business, 'id' | 'verificationStatus' | 'createdAt' | 'documentsCount'>,
  documentFiles: Array<{ documentType: string; fileName: string; fileSizeBytes: number; mimeType: string }>
): { nextState: DirectoryState; newBusinessId: string } {
  const newBusinessId = `biz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newBusiness: Business = {
    ...data,
    id: newBusinessId,
    verificationStatus: documentFiles.length > 0 ? 'pending_review' : 'unverified',
    verificationDetails:
      documentFiles.length > 0
        ? 'Dossier avec documents justificatifs déposé — en attente de vérification.'
        : 'Fiche déclarative non auditée.',
    documentsCount: documentFiles.length,
    createdAt: new Date().toISOString(),
  };

  const newDocs: BusinessDocument[] = documentFiles.map((doc, idx) => ({
    id: `doc_${Date.now()}_${idx}`,
    businessId: newBusinessId,
    documentType: doc.documentType,
    fileName: doc.fileName,
    fileSizeBytes: doc.fileSizeBytes,
    mimeType: doc.mimeType,
    status: 'pending',
    uploadedAt: new Date().toISOString(),
  }));

  const nextState: DirectoryState = {
    ...currentState,
    businesses: [newBusiness, ...currentState.businesses],
    documents: [...newDocs, ...currentState.documents],
  };

  saveDirectoryState(nextState);
  return { nextState, newBusinessId };
}

export function reviewBusiness(
  currentState: DirectoryState,
  params: {
    businessId: string;
    reviewerId: string;
    newStatus: VerificationStatus;
    reasonCode: string;
    reviewerNotes?: string;
  }
): DirectoryState {
  const { businessId, reviewerId, newStatus, reasonCode, reviewerNotes } = params;
  const targetBiz = currentState.businesses.find((b) => b.id === businessId);
  if (!targetBiz) return currentState;

  const newReview: VerificationReview = {
    id: `rev_${Date.now()}`,
    businessId,
    reviewerId,
    previousStatus: targetBiz.verificationStatus,
    newStatus,
    reasonCode,
    reviewerNotes,
    reviewedAt: new Date().toISOString(),
  };

  let badgeDetails = targetBiz.verificationDetails;
  if (newStatus === 'documents_verified') {
    badgeDetails = `Documents d'activité vérifiés et validés par modérateur (${reasonCode}).`;
  } else if (newStatus === 'location_confirmed') {
    badgeDetails = 'Adresse et localisation confirmées.';
  } else if (newStatus === 'rejected') {
    badgeDetails = `Dossier non validé: ${reviewerNotes || reasonCode}.`;
  }

  const updatedBusinesses = currentState.businesses.map((b) =>
    b.id === businessId
      ? {
          ...b,
          verificationStatus: newStatus,
          verificationDetails: badgeDetails,
        }
      : b
  );

  const updatedDocs = currentState.documents.map((d) =>
    d.businessId === businessId
      ? {
          ...d,
          status: newStatus === 'documents_verified' ? ('verified' as const) : newStatus === 'rejected' ? ('rejected' as const) : d.status,
        }
      : d
  );

  const nextState: DirectoryState = {
    ...currentState,
    businesses: updatedBusinesses,
    documents: updatedDocs,
    reviews: [newReview, ...currentState.reviews],
  };

  saveDirectoryState(nextState);
  return nextState;
}

export function reportBusiness(
  currentState: DirectoryState,
  params: {
    businessId: string;
    reason: BusinessReport['reason'];
    details: string;
  }
): DirectoryState {
  const targetBiz = currentState.businesses.find((b) => b.id === params.businessId);
  const newReport: BusinessReport = {
    id: `rep_${Date.now()}`,
    businessId: params.businessId,
    businessName: targetBiz?.name || 'Commerce',
    reason: params.reason,
    details: params.details,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const nextState: DirectoryState = {
    ...currentState,
    reports: [newReport, ...currentState.reports],
  };

  saveDirectoryState(nextState);
  return nextState;
}

export function resolveReport(
  currentState: DirectoryState,
  reportId: string,
  newStatus: 'resolved' | 'dismissed'
): DirectoryState {
  const nextState: DirectoryState = {
    ...currentState,
    reports: currentState.reports.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)),
  };
  saveDirectoryState(nextState);
  return nextState;
}
