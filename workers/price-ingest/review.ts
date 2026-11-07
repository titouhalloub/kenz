import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const approveRunId = option('--approve-run-id');
const enableSourceSlug = option('--enable-source');
const termsReviewedAt = option('--terms-reviewed-at');
const confirmed = args.includes('--confirm-source-review');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!approveRunId && !enableSourceSlug) {
  throw new Error('Provide --approve-run-id <uuid> and/or --enable-source <slug>.');
}
if (enableSourceSlug && (!confirmed || !termsReviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(termsReviewedAt))) {
  throw new Error('Enabling a source requires --confirm-source-review and --terms-reviewed-at YYYY-MM-DD after a human has checked its published access/reuse terms.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function main() {
  if (enableSourceSlug) {
    const { data, error } = await supabase.from('price_sources').update({
      reviewed: true,
      enabled: true,
      terms_reviewed_at: new Date(`${termsReviewedAt}T00:00:00.000Z`).toISOString(),
      robots_reviewed_at: new Date().toISOString(),
    }).eq('slug', enableSourceSlug).select('id,slug').single();
    if (error || !data) throw new Error(`Could not enable source ${enableSourceSlug}: ${error?.message || 'not found'}`);
    console.log(`Source enabled after explicit operator confirmation: ${data.slug}`);
  }

  if (approveRunId) {
    const { data, error } = await supabase.from('price_observations').update({
      status: 'accepted',
      reviewed_at: new Date().toISOString(),
      quality_flags: ['public_scrape', 'operator_approved'],
    }).eq('ingest_run_id', approveRunId).eq('status', 'pending').select('id');
    if (error) throw new Error(`Could not approve ingest run ${approveRunId}: ${error.message}`);
    console.log(`Approved ${data?.length || 0} pending observations from run ${approveRunId}.`);
  }

  const { error: refreshError } = await supabase.rpc('refresh_price_stats', { p_window_days: 14 });
  if (refreshError) throw new Error(`Could not refresh public price aggregates: ${refreshError.message}`);
  console.log('14-day public price aggregates refreshed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
