import { getSupabaseClient } from './supabase';

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
}
export interface PriceAdminResult<T> { success: boolean; data?: T; error?: string; }

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function loadPriceAdminData(): Promise<PriceAdminResult<{
  sources: PriceSourceHealth[];
  pending: PendingPriceObservation[];
}>> {
  try {
    const supabase = client();
    const [sources, pending] = await Promise.all([
      supabase.rpc('get_price_source_health'),
      supabase.rpc('list_pending_price_observations', { p_limit: 150 }),
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
