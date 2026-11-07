import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_PRICE_SOURCES, scrapePublicSource } from './publicSources';

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  console.warn('Price ingestion skipped: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the workflow secrets.');
  process.exit(0);
}

const supabase = !dryRun && supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

function sourceKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

async function main() {
  let sourceBySlug = new Map<string, { id: string; enabled: boolean; reviewed: boolean; termsReviewedAt: string | null }>();
  let productBySlug = new Map<string, { id: string; base_unit: string }>();

  if (supabase) {
    const { data: sources, error: sourceError } = await supabase
      .from('price_sources').select('id,slug,enabled,reviewed,terms_reviewed_at')
      .in('slug', PUBLIC_PRICE_SOURCES.map((source) => source.slug));
    if (sourceError) {
      if (/does not exist|schema cache|could not find the table/i.test(sourceError.message)) {
        console.warn('Price ingestion is ready, but migration 039 and the price catalog have not been deployed. No data was written.');
        return;
      }
      throw new Error(`Cannot read price source registry: ${sourceError.message}`);
    }
    sourceBySlug = new Map((sources || []).map((row) => [row.slug, {
      id: row.id, enabled: Boolean(row.enabled), reviewed: Boolean(row.reviewed),
      termsReviewedAt: row.terms_reviewed_at,
    }]));

    const { data: products, error: productError } = await supabase
      .from('products').select('id,slug,base_unit').eq('is_active', true);
    if (productError) throw new Error(`Cannot read product catalog: ${productError.message}`);
    productBySlug = new Map((products || []).map((row) => [row.slug, row]));
  }

  let failures = 0;
  for (const source of PUBLIC_PRICE_SOURCES) {
    try {
      let sourceId: string | null = null;
      if (!dryRun) {
        const sourceRecord = sourceBySlug.get(source.slug);
        if (!sourceRecord) {
          console.warn(`Source ${source.slug} is not registered. Apply migrations 039–040 before ingestion.`);
          failures += 1;
          continue;
        }
        if (!sourceRecord.enabled || !sourceRecord.reviewed || !sourceRecord.termsReviewedAt) {
          console.log(`${source.slug}: skipped; source is not yet reviewed and enabled by an operator.`);
          continue;
        }
        sourceId = sourceRecord.id;
      }

      const scraped = await scrapePublicSource(source);
      const freshCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const freshScraped = scraped.filter((row) => {
        const observed = Date.parse(row.normalized.observedAt);
        return Number.isFinite(observed) && observed >= freshCutoff && observed <= Date.now() + 24 * 60 * 60 * 1000;
      });
      const staleRows = scraped.length - freshScraped.length;
      if (dryRun) {
        console.log(JSON.stringify({
          source: source.slug,
          rows: scraped.length,
          freshRows: freshScraped.length,
          staleRows,
          sample: scraped.slice(0, 8).map((row) => ({
            product: row.productSlug,
            unitPriceMinor: row.normalized.unitPriceMinor,
            currency: row.normalized.currency,
            observedAt: row.normalized.observedAt,
            wilayaCode: row.normalized.wilayaCode || null,
            sourceReference: row.sourceReference,
          })),
        }, null, 2));
        continue;
      }

      const { data: run, error: runError } = await supabase!
        .from('ingest_runs').insert({ source_id: sourceId!, status: 'running' })
        .select('id').single();
      if (runError || !run) {
        console.error(`Cannot create ingest run for ${source.slug}: ${runError?.message || 'unknown error'}`);
        failures += 1;
        continue;
      }

      try {
        const observations = freshScraped.flatMap((row) => {
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
            source_id: sourceId!,
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
          const { error: insertError } = await supabase!
            .from('price_observations')
            .upsert(observations, { onConflict: 'source_record_key', ignoreDuplicates: true });
          if (insertError) throw new Error(`Cannot stage observations: ${insertError.message}`);
        }

        const { error: finishError } = await supabase!.from('ingest_runs').update({
          finished_at: new Date().toISOString(),
          rows_fetched: scraped.length,
          rows_parsed: freshScraped.length,
          rows_accepted: 0,
          error_count: 0,
          status: 'succeeded',
          error_summary: observations.length === 0
            ? (staleRows > 0 ? `All ${staleRows} matched rows were outside the 14-day freshness window.` : 'No fresh product rows matched the curated catalog; nothing was published.')
            : (staleRows > 0 ? `${staleRows} stale rows were excluded.` : null),
        }).eq('id', run.id);
        if (finishError) throw new Error(`Cannot finish ingest run: ${finishError.message}`);
        console.log(`${source.slug}: staged ${observations.length} fresh observations; excluded ${staleRows} stale rows (run ${run.id}).`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await supabase!.from('ingest_runs').update({
          finished_at: new Date().toISOString(),
          error_count: 1,
          status: 'failed',
          error_summary: message.slice(0, 1000),
        }).eq('id', run.id);
        throw error;
      }
    } catch (error) {
      failures += 1;
      console.error(`${source.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (dryRun) {
    console.log('Dry run complete. No database credentials were used and no data was written.');
  } else if (failures > 0) {
    console.warn(`Price ingestion completed with ${failures} source issue(s).`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
