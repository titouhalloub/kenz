-- Supabase PostgreSQL Migration: Phase 2 Neighborhood Directory & Verification
-- Primary backend schema for verified local businesses and document reviews

DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM (
    'unverified', 
    'pending_review', 
    'location_confirmed', 
    'documents_verified', 
    'rejected', 
    'expired', 
    'suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Businesses Directory Table
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  phone TEXT,
  address_text TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Alger',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  opening_hours TEXT,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  verification_details TEXT,
  last_confirmed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_businesses_location ON public.businesses(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_businesses_category ON public.businesses(category);

-- 2. Private Business Verification Documents Table
CREATE TABLE IF NOT EXISTS public.business_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- e.g., 'Registre de Commerce (CNRC)', 'Agrément Artisanal'
  storage_path TEXT NOT NULL,  -- Stored in private bucket 'business-verification'
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

-- 3. Verification Decision Audit Trail
CREATE TABLE IF NOT EXISTS public.verification_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  previous_status public.verification_status NOT NULL,
  new_status public.verification_status NOT NULL,
  reason_code TEXT NOT NULL,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Community Reports / Moderation Queue
CREATE TABLE IF NOT EXISTS public.business_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Security Policies
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_reports ENABLE ROW LEVEL SECURITY;

-- Businesses: Public can only view published businesses; Owners can update their details
DROP POLICY IF EXISTS "Public can view published businesses" ON public.businesses;
CREATE POLICY "Public can view published businesses" ON public.businesses FOR SELECT USING (is_published = TRUE OR auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update own business" ON public.businesses;
CREATE POLICY "Owners can update own business" ON public.businesses FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can register a business" ON public.businesses;
CREATE POLICY "Owners can register a business" ON public.businesses FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Documents: Only business owner can upload / view private metadata; NEVER public
DROP POLICY IF EXISTS "Owners can insert verification documents" ON public.business_documents;
CREATE POLICY "Owners can insert verification documents" ON public.business_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.businesses WHERE businesses.id = business_documents.business_id AND businesses.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can view own document metadata" ON public.business_documents;
CREATE POLICY "Owners can view own document metadata" ON public.business_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.businesses WHERE businesses.id = business_documents.business_id AND businesses.owner_id = auth.uid())
);

-- Reports: Authenticated or public users can insert a report
DROP POLICY IF EXISTS "Anyone can submit a report" ON public.business_reports;
CREATE POLICY "Anyone can submit a report" ON public.business_reports FOR INSERT WITH CHECK (TRUE);
