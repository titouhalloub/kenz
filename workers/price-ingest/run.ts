import { createClient } from '@supabase/supabase-js';
import { PRODUCT_CATALOG } from '../../src/domain/productCatalog';
import { PRICE_EXTENDED_WINDOW_DAYS } from '../../src/domain/priceWindow';
import { PUBLIC_PRICE_SOURCES, scrapePublicSource } from './publicSources';
import { loadPriceWindows, refreshAllStats, stageCandidates } from './stage';

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error('Price ingestion requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; configure the free GitHub Actions secret before enabling scheduled writes.');
}

const supabase = !dryRun && supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

async function main() {
  let sourceBySlug = new Map<string, { id: string; enabled: boolean; reviewed: boolean; termsReviewedAt: string | null }>();
  let productBySlug = new Map<string, { id: string; base_unit: string }>();

  if (supabase) {
    const { data: sources, error: sourceError } = await supabase
      .from('price_sources').select('id,slug,enabled,reviewed,terms_reviewed_at')
      .in('slug', PUBLIC_PRICE_SOURCES.map((source) => source.slug));
    if (sourceError) {
      if (/does not exist|schema cache|could not find the table/i.test(sourceError.message)) {
        throw new Error('Price ingestion is ready, but migrations 036–040 are not deployed. No data was written.');
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
    const missingCatalogSlugs = PRODUCT_CATALOG.map((product) => product.slug)
      .filter((slug) => !productBySlug.has(slug));
    if (missingCatalogSlugs.length > 0) {
      throw new Error(`Database product catalog is missing ${missingCatalogSlugs.length} canonical slugs. Apply migration 040 before ingestion: ${missingCatalogSlugs.slice(0, 8).join(', ')}`);
    }
  }

  let extendedDays = PRICE_EXTENDED_WINDOW_DAYS;
  if (supabase) extendedDays = (await loadPriceWindows(supabase)).extendedDays;
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
      if (scraped.length === 0) throw new Error('The source returned no matched product rows; review the parser before trusting this run.');
      // Official bulletins are not daily: stage anything inside the extended window. Rows stay
      // `pending`; a moderator still decides, and aggregates label anything older than 14 days as stale.
      const freshCutoff = Date.now() - extendedDays * 24 * 60 * 60 * 1000;
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
        // Unit consistency: the scraped unit must match the catalog base unit stored in the database.
        const candidates = freshScraped.flatMap((row) => {
          const product = productBySlug.get(row.productSlug);
          if (!product || product.base_unit !== row.normalized.baseUnit) return [];
          return [{
            productSlug: row.productSlug,
            unitPriceMinor: row.normalized.unitPriceMinor,
            observedAt: row.normalized.observedAt,
            wilayaCode: row.normalized.wilayaCode || null,
            sourceReference: row.sourceReference,
          }];
        });

        // Same validation + staging as admin imports: everything lands as `pending`.
        const report = await stageCandidates(supabase!, {
          sourceId: sourceId!, sourceSlug: source.slug, ingestRunId: run.id,
          channelFlags: ['public_scrape', 'awaiting_review'],
          productIdBySlug: new Map([...productBySlug].map(([slug, product]) => [slug, product.id])),
          candidates,
        });
        const observations = { length: report.staged + report.duplicatesIgnored };
        if (report.rejected.length > 0) console.warn(`${source.slug}: ${report.rejected.length} rows failed validation and were not staged.`);

        const { error: finishError } = await supabase!.from('ingest_runs').update({
          finished_at: new Date().toISOString(),
          rows_fetched: scraped.length,
          rows_parsed: freshScraped.length,
          rows_accepted: 0,
          error_count: 0,
          status: 'succeeded',
          error_summary: observations.length === 0
            ? (staleRows > 0 ? `All ${staleRows} matched rows were outside the ${extendedDays}-day window.` : 'No fresh product rows matched the curated catalog; nothing was published.')
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
  } else if (supabase) {
    // Re-derive aggregates from ALREADY ACCEPTED observations so expired ones age out even when
    // no moderator acts. This never accepts, edits or creates an observation.
    await refreshAllStats(supabase);
  }
  if (failures > 0) {
    console.error(`Price ingestion completed with ${failures} source issue(s).`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
