import { describe, it, expect } from 'vitest';
import {
  submitBusiness,
  reviewBusiness,
  reportBusiness,
  resolveReport,
  DirectoryState,
} from './directoryStore';

describe('Phase 2 Directory & Verification Store', () => {
  const sampleState: DirectoryState = {
    businesses: [],
    documents: [],
    reviews: [],
    reports: [],
  };

  it('initializes a submission with pending_review when documents are provided', () => {
    const { nextState, newBusinessId } = submitBusiness(
      sampleState,
      {
        ownerId: 'owner-1',
        name: 'Plomberie Alger Centre',
        category: 'Plomberie & Dépannage',
        description: 'Dépannage sanitaire 24/7',
        phone: '+213 555 00 11 22',
        addressText: 'Rue Didouche Mourad',
        city: 'Alger',
        latitude: 36.77,
        longitude: 3.05,
        openingHours: '08:00 - 18:00',
        lastConfirmedDate: '2026-10-13',
        isPublished: true,
      },
      [
        {
          documentType: 'Registre de Commerce (CNRC)',
          fileName: 'cnrc_alger.pdf',
          fileSizeBytes: 102400,
          mimeType: 'application/pdf',
        },
      ]
    );

    const createdBiz = nextState.businesses.find((b) => b.id === newBusinessId);
    expect(createdBiz).toBeDefined();
    expect(createdBiz?.verificationStatus).toBe('pending_review');
    expect(createdBiz?.documentsCount).toBe(1);

    const createdDoc = nextState.documents.find((d) => d.businessId === newBusinessId);
    expect(createdDoc).toBeDefined();
    expect(createdDoc?.status).toBe('pending');
  });

  it('allows an authorized reviewer to approve documents and records audit trail', () => {
    const { nextState, newBusinessId } = submitBusiness(
      sampleState,
      {
        ownerId: 'owner-2',
        name: 'Pharmacie Bab El Oued',
        category: 'Santé & Pharmacie',
        description: 'Officine pharmaceutique',
        phone: '+213 21 00 00 00',
        addressText: 'Bab El Oued',
        city: 'Alger',
        latitude: 36.78,
        longitude: 3.05,
        openingHours: '08:00 - 20:00',
        lastConfirmedDate: '2026-10-13',
        isPublished: true,
      },
      [
        {
          documentType: 'Agrément Pharmaceutique',
          fileName: 'agrement.pdf',
          fileSizeBytes: 500000,
          mimeType: 'application/pdf',
        },
      ]
    );

    // Reviewer approves
    const reviewedState = reviewBusiness(nextState, {
      businessId: newBusinessId,
      reviewerId: 'reviewer-admin-99',
      newStatus: 'documents_verified',
      reasonCode: 'DOCS_VALID_PHARMACY',
      reviewerNotes: 'Agrément ministériel vérifié.',
    });

    const updatedBiz = reviewedState.businesses.find((b) => b.id === newBusinessId);
    expect(updatedBiz?.verificationStatus).toBe('documents_verified');
    expect(updatedBiz?.verificationDetails).toContain('DOCS_VALID_PHARMACY');

    // Audit trail record created
    expect(reviewedState.reviews.length).toBe(1);
    expect(reviewedState.reviews[0].businessId).toBe(newBusinessId);
    expect(reviewedState.reviews[0].newStatus).toBe('documents_verified');

    // Document status updated
    const updatedDoc = reviewedState.documents.find((d) => d.businessId === newBusinessId);
    expect(updatedDoc?.status).toBe('verified');
  });

  it('records and resolves community reports', () => {
    const reportedState = reportBusiness(sampleState, {
      businessId: 'biz-test',
      reason: 'inaccurate_info',
      details: 'Le numéro de téléphone a changé.',
    });

    expect(reportedState.reports.length).toBe(1);
    const reportId = reportedState.reports[0].id;
    expect(reportedState.reports[0].status).toBe('pending');

    const resolvedState = resolveReport(reportedState, reportId, 'resolved');
    expect(resolvedState.reports[0].status).toBe('resolved');
  });
});
