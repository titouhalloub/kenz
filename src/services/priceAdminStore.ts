import { getSupabaseClient } from './supabase';
import { validatePriceInput, type PriceInputRow } from '../domain/priceValidation';

export interface PriceSourceHealth {
  source_id: string;
  source_slug: string;
  source_name: string;
  source_type: string;
  enabled: boolean;
  reviewed: boolean;
  schedule: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_rows_parsed: number | null;
  last_rows_accepted: number | null;
  pending_observations: number;
}
export interface PendingPriceObservation {
  observation_id: string;
  product_slug: string;
  product_name: string;
  source_slug: string;
  source_name: string;
  unit_price_minor: number;
  observed_at: string;
  wilaya_code: string | null;
  quality_flags: string[];
  source_reference: string | null;
  ingest_run_id: string | null;
  status?: 'pending' | 'accepted' | 'rejected';
  source_type?: string;
  base_unit?: string;
  evidence_url?: string | null;
  note?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
}
export type PriceQueueStatus = 'pending' | 'accepted' | 'rejected';
export interface PriceAdminResult<T> { success: boolean; data?: T; error?: string; }

const PRICE_ADMIN_TIMEOUT_MS = 12_000;

function withTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' timed out after 12 seconds. Check the connection and retry.')), PRICE_ADMIN_TIMEOUT_MS);
    Promise.resolve(request).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function loadPriceAdminData(status: PriceQueueStatus = 'pending'): Promise<PriceAdminResult<{
  sources: PriceSourceHealth[];
  pending: PendingPriceObservation[];
}>> {
  try {
    const supabase = client();
    const listing = async () => {
      const full = await withTimeout(
        supabase.rpc('list_price_observations', { p_status: status, p_limit: 150 }),
        'Price review queue request',
      );
      if (!full.error) return full;
      if (status !== 'pending') throw full.error;
      return withTimeout(
        supabase.rpc('list_pending_price_observations', { p_limit: 150 }),
        'Pending price list request',
      );
    };
    const [sources, pending] = await Promise.all([
      withTimeout(supabase.rpc('get_price_source_health'), 'Price source health request'),
      listing(),
    ]);
    if (sources.error) throw sources.error;
    if (pending.error) throw pending.error;
    return {
      success: true,
      data: {
        sources: (sources.data || []) as PriceSourceHealth[],
        pending: (pending.data || []) as PendingPriceObservation[],
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to load price review queue.' };
  }
}

export async function stageAdminPrices(rows: PriceInputRow[]): Promise<PriceAdminResult<{
  staged: number;
  failed: Array<{ productSlug: string; message: string }>;
}>> {
  try {
    const supabase = client();
    const seen = new Set<string>();
    const failed: Array<{ productSlug: string; message: string }> = [];
    let staged = 0;
    for (const row of rows) {
      const checked = validatePriceInput(row, { now: new Date(), seenKeys: seen });
      if (!checked.ok || !checked.row) { failed.push({ productSlug: row.productSlug, message: checked.errors.join(', ') }); continue; }
      if (!checked.row.sourceReference || checked.row.sourceReference.trim().length < 3) {
        failed.push({ productSlug: row.productSlug, message: 'source_reference_required' });
        continue;
      }
      const { error } = await withTimeout(supabase.rpc('admin_stage_price_observation', {
        p_product_slug: checked.row.productSlug,
        p_unit_price_minor: checked.row.unitPriceMinor,
        p_observed_at: checked.row.observedAt,
        p_wilaya_code: checked.row.wilayaCode,
        p_source_reference: checked.row.sourceReference,
        p_note: checked.row.note ?? null,
      }), 'Price import request');
      if (error) failed.push({ productSlug: row.productSlug, message: error.message });
      else staged += 1;
    }
    return { success: true, data: { staged, failed } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to stage prices.' };
  }
}

export async function reviewPriceObservation(
  observationId: string,
  decision: 'accepted' | 'rejected',
  reason: string,
): Promise<PriceAdminResult<boolean>> {
  try {
    const { error } = await withTimeout(client().rpc('review_price_observation', {
      p_observation_id: observationId,
      p_decision: decision,
      p_reason: reason,
    }), 'Price review decision request');
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to review price observation.' };
  }
}
