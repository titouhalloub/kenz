/**
 * Admin / manual price import (channel 2). Stages a CSV as PENDING observations for the
 * 'admin-manual-import' source, through the same validation as every other channel.
 *
 *   npx tsx workers/price-ingest/import.ts --file prices.csv [--dry-run]
 *
 * CSV columns: product_slug, unit_price, observed_at (required); unit, wilaya_code,
 * source_reference, note (optional). Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY unless
 * --dry-run. The source must already be enabled and reviewed by an operator; this script
 * never enables a source, accepts a price or touches existing rows.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parsePriceCsv, validatePriceInput } from '../../src/domain/priceValidation';
import { DEFAULT_PRICE_WINDOWS } from '../../src/domain/priceWindow';
import { refreshAllStats, stageCandidates } from './stage';

const SOURCE_SLUG = 'admin-manual-import';
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = option('--file');
const dryRun = args.includes('--dry-run');

async function main() {
  if (!file) throw new Error('Provide --file <prices.csv>');
  const parsed = parsePriceCsv(readFileSync(file, 'utf8'));
  for (const error of parsed.errors) console.warn(`line ${error.line}: ${error.message}`);

  if (dryRun) {
    const seen = new Set<string>();
    let valid = 0;
    for (const row of parsed.rows) {
      const result = validatePriceInput(row, { now: new Date(), windows: DEFAULT_PRICE_WINDOWS, seenKeys: seen });
      if (result.ok) valid += 1; else console.warn(`${row.productSlug}: ${result.errors.join(', ')}`);
    }
    console.log(`Dry run: ${valid}/${parsed.rows.length} rows valid, ${parsed.errors.length} unreadable lines. Nothing was written.`);
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Import needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const { data: source, error: sourceError } = await supabase.from('price_sources')
    .select('id,enabled,reviewed').eq('slug', SOURCE_SLUG).maybeSingle();
  if (sourceError || !source) throw new Error(`Source "${SOURCE_SLUG}" is not registered. Migration 057 must be applied first.`);
  if (!source.enabled || !source.reviewed) throw new Error(`Source "${SOURCE_SLUG}" is not enabled/reviewed by an operator yet.`);

  const { data: products, error: productError } = await supabase.from('products').select('id,slug').eq('is_active', true);
  if (productError) throw new Error(`Cannot read products: ${productError.message}`);

  const report = await stageCandidates(supabase, {
    sourceId: source.id, sourceSlug: SOURCE_SLUG, ingestRunId: null,
    channelFlags: ['admin_import', 'awaiting_review'],
    productIdBySlug: new Map((products || []).map((row) => [row.slug as string, row.id as string])),
    candidates: parsed.rows,
  });
  console.log(`Staged ${report.staged} pending observations; ${report.duplicatesIgnored} already existed; ${report.rejected.length} rejected by validation.`);
  for (const rejected of report.rejected) console.warn(`${rejected.productSlug}: ${rejected.errors.join(', ')}`);

  // Re-derive aggregates from already-accepted rows only (imports themselves stay pending).
  await refreshAllStats(supabase);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
