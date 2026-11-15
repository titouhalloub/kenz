import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PRICE_WINDOWS, PRICE_STATS_WINDOWS, resolvePriceWindows, type PriceWindows } from '../../src/domain/priceWindow';
import { validatePriceInput, type PriceInputRow } from '../../src/domain/priceValidation';

/**
 * Shared staging step for the OFFICIAL and ADMIN-IMPORT channels (community submissions use the
 * `submit_price_observation` RPC, which applies the same rules in SQL). Everything lands in
 * `price_observations` as `pending`; nothing here can accept or publish a price.
 */

export interface StageCandidate extends PriceInputRow {
  /** Stable text used to make re-imports idempotent (same record → same source_record_key). */
  recordSalt?: string;
}

export interface StageReport {
  staged: number;
  duplicatesIgnored: number;
  rejected: Array<{ productSlug: string; errors: string[] }>;
}

/**
 * Re-derives published aggregates from ALREADY ACCEPTED observations (all configured windows).
 * Also drops observations that aged out. Never accepts, edits or creates an observation.
 * Falls back to the two default windows when migration 057 is not applied yet.
 */
export async function refreshAllStats(supabase: SupabaseClient): Promise<void> {
  const all = await supabase.rpc('refresh_price_stats_all');
  if (!all.error) return;
  for (const windowDays of PRICE_STATS_WINDOWS) {
    const { error } = await supabase.rpc('refresh_price_stats', { p_window_days: windowDays });
    if (error) console.warn(`Could not refresh ${windowDays}-day price aggregates: ${error.message}`);
  }
}

export async function loadPriceWindows(supabase: SupabaseClient): Promise<PriceWindows> {
  const { data, error } = await supabase.rpc('get_price_windows');
  if (error || !data) return DEFAULT_PRICE_WINDOWS; // migration 057 not applied yet
  return resolvePriceWindows(Array.isArray(data) ? data[0] : data);
}

/** National published median per product, used only to flag suspicious values (never to change them). */
export async function loadReferenceMedians(supabase: SupabaseClient, windowDays: number): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('price_stats')
    .select('median_unit_price_minor, products!inner(slug)')
    .eq('area_level', 'national').eq('area_key', 'DZ').eq('window_days', windowDays);
  if (error || !data) return {};
  const medians: Record<string, number> = {};
  for (const row of data as unknown as Array<{ median_unit_price_minor: number; products: { slug: string } | { slug: string }[] }>) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (product?.slug) medians[product.slug] = Number(row.median_unit_price_minor);
  }
  return medians;
}

/**
 * Same formula the original scraper used (source|product|observedAt|wilaya|price|reference), so
 * re-running ingestion never duplicates rows that are already pending or reviewed. The optional
 * salt is appended only when present.
 */
const recordKey = (sourceSlug: string, productId: string, observedIso: string, candidate: StageCandidate, wilaya: string | null) =>
  createHash('sha256').update([
    sourceSlug, productId, observedIso, wilaya || 'DZ', String(candidate.unitPriceMinor),
    candidate.sourceReference || '', ...(candidate.recordSalt ? [candidate.recordSalt] : []),
  ].join('|')).digest('hex');

export async function stageCandidates(
  supabase: SupabaseClient,
  params: {
    sourceId: string;
    sourceSlug: string;
    ingestRunId: string | null;
    channelFlags: string[];
    productIdBySlug: Map<string, string>;
    candidates: StageCandidate[];
  },
): Promise<StageReport> {
  const windows = await loadPriceWindows(supabase);
  const referenceMedianBySlug = await loadReferenceMedians(supabase, windows.freshDays);
  const seenKeys = new Set<string>();
  const report: StageReport = { staged: 0, duplicatesIgnored: 0, rejected: [] };
  const rows: Array<Record<string, unknown>> = [];

  for (const candidate of params.candidates) {
    const result = validatePriceInput(candidate, { now: new Date(), windows, referenceMedianBySlug, seenKeys, requireSourceReference: params.sourceSlug === 'admin-manual-import' });
    const productId = params.productIdBySlug.get(candidate.productSlug);
    if (!result.ok || !result.row || !productId) {
      report.rejected.push({ productSlug: candidate.productSlug, errors: result.errors.length ? result.errors : ['product_not_in_database'] });
      continue;
    }
    rows.push({
      product_id: productId,
      source_id: params.sourceId,
      unit_price_minor: result.row.unitPriceMinor,
      currency: 'DZD',
      observed_at: result.row.observedAt,
      wilaya_code: result.row.wilayaCode,
      source_reference: result.row.sourceReference ? result.row.sourceReference.slice(0, 500) : null,
      source_record_key: recordKey(params.sourceSlug, productId, result.row.observedAt, candidate, result.row.wilayaCode),
      ingest_run_id: params.ingestRunId,
      status: 'pending', // always: moderation decides
      quality_flags: [...new Set([...params.channelFlags, ...result.flags])],
    });
  }

  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('price_observations')
      .upsert(rows, { onConflict: 'source_record_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`Cannot stage observations: ${error.message}`);
    report.staged = data?.length ?? 0;
    report.duplicatesIgnored = rows.length - report.staged;
  }
  return report;
}
