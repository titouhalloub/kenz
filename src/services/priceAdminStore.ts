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
  /** Present when migration 057 is applied (list_price_observations). */
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
    // list_price_observations (migration 057) returns unit, evidence and review history. Until it is
    // applied, fall back to the original pending-only list so the screen keeps working.
    const listing = async () => {
      const full = await supabase.rpc('list_price_observations', { p_status: status, p_limit: 150 });
      if (!full.error) return full;
      if (status !== 'pending') throw full.error;
      return supabase.rpc('list_pending_price_observations', { p_limit: 150 });
    };
    const [sources, pending] = await Promise.all([supabase.rpc('get_price_source_health'), listing()]);
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

/**
 * Channel 2 (admin): stages validated rows as PENDING through the moderator-only RPC. The rows still
 * need an explicit accept in the review queue. Validation is the shared priceValidation module.
 */
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
      const { error } = await supabase.rpc('admin_stage_price_observation', {
        p_product_slug: checked.row.productSlug,
        p_unit_price_minor: checked.row.unitPriceMinor,
        p_observed_at: checked.row.observedAt,
        p_wilaya_code: checked.row.wilayaCode,
        p_source_reference: checked.row.sourceReference,
        p_note: checked.row.note ?? null,
      });
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
    const { error } = await client().rpc('review_price_observation', {
      p_observation_id: observationId,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to review price observation.' };
  }
}
