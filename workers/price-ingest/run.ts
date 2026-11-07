import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_PRICE_SOURCES, scrapePublicSource } from './publicSources';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Price ingestion skipped: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the workflow secrets.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function sourceKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

async function main() {
  const { data: sources, error: sourceError } = await supabase
    .from('price_sources').select('id,slug')
    .in('slug', PUBLIC_PRICE_SOURCES.map((source) => source.slug));
  if (sourceError) throw new Error(`Cannot read price source registry: ${sourceError.message}`);
  const sourceBySlug = new Map((sources || []).map((row) => [row.slug, row.id]));

  const { data: products, error: productError } = await supabase
    .from('products').select('id,slug,base_unit').eq('is_active', true);
  if (productError) throw new Error(`Cannot read product catalog: ${productError.message}`);
  const productBySlug = new Map((products || []).map((row) => [row.slug, row]));

  let failures = 0;
  for (const source of PUBLIC_PRICE_SOURCES) {
    const sourceId = sourceBySlug.get(source.slug);
    if (!sourceId) {
      console.warn(`Source ${source.slug} is not registered. Apply migration 039 before ingestion.`);
      failures += 1;
      continue;
    }

    const { data: run, error: runError } = await supabase
      .from('ingest_runs')
      .insert({ source_id: sourceId, status: 'running' })
      .select('id').single();
    if (runError || !run) {
      console.error(`Cannot create ingest run for ${source.slug}: ${runError?.message || 'unknown error'}`);
      failures += 1;
      continue;
    }

    try {
      const scraped = await scrapePublicSource(source);
      const observations = scraped.flatMap((row) => {
        const product = productBySlug.get(row.productSlug);
        if (!product || product.base_unit !== row.normalized.baseUnit) return [];
        const recordKey = sourceKey([
          source.slug,
          product.id,
          row.normalized.observedAt,
          row.normalized.wilayaCode || 'DZ',
          String(row.normalized.unitPriceMinor),
          row.sourceReference,
        ]);
        return [{
          product_id: product.id,
          source_id: sourceId,
          unit_price_minor: row.normalized.unitPriceMinor,
          currency: 'DZD',
          observed_at: row.normalized.observedAt,
          wilaya_code: row.normalized.wilayaCode || null,
          source_reference: row.sourceReference,
          source_record_key: recordKey,
          ingest_run_id: run.id,
          status: 'pending',
          quality_flags: ['public_scrape', 'awaiting_review'],
        }];
      });

      if (observations.length > 0) {
        const { error: insertError } = await supabase
          .from('price_observations')
          .upsert(observations, { onConflict: 'source_record_key', ignoreDuplicates: true });
        if (insertError) throw new Error(`Cannot stage observations: ${insertError.message}`);
      }

      const { error: finishError } = await supabase.from('ingest_runs').update({
        finished_at: new Date().toISOString(),
        rows_fetched: scraped.length,
        rows_parsed: scraped.length,
        rows_accepted: 0,
        error_count: 0,
        status: 'succeeded',
        error_summary: observations.length === 0 ? 'No product rows matched the curated catalog; nothing was published.' : null,
      }).eq('id', run.id);
      if (finishError) throw new Error(`Cannot finish ingest run: ${finishError.message}`);
      console.log(`${source.slug}: staged ${observations.length} observations as pending review (run ${run.id}).`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('ingest_runs').update({
        finished_at: new Date().toISOString(),
        error_count: 1,
        status: 'failed',
        error_summary: message.slice(0, 1000),
      }).eq('id', run.id);
      console.error(`${source.slug}: ${message}`);
    }
  }

  if (failures > 0) {
    console.warn(`Price ingestion completed with ${failures} source issue(s).`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
