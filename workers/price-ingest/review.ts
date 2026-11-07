import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const enableSourceSlug = option('--enable-source');
const termsReviewedAt = option('--terms-reviewed-at');
const confirmed = args.includes('--confirm-source-review');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!enableSourceSlug) throw new Error('Provide --enable-source <slug> after a human has reviewed the source.');
if (!confirmed || !termsReviewedAt || !/^\\d{4}-\\d{2}-\\d{2}$/.test(termsReviewedAt)) {
  throw new Error('Enabling a source requires --confirm-source-review and --terms-reviewed-at YYYY-MM-DD after a human has checked its published access/reuse terms.');
}
const reviewedDate = new Date(termsReviewedAt + 'T00:00:00.000Z');
if (Number.isNaN(reviewedDate.getTime()) || reviewedDate.toISOString().slice(0, 10) !== termsReviewedAt) {
  throw new Error('The source review date is not a valid calendar date.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function main() {
  const { data, error } = await supabase.from('price_sources').update({
    reviewed: true,
    enabled: true,
    terms_reviewed_at: reviewedDate.toISOString(),
    robots_reviewed_at: new Date().toISOString(),
  }).eq('slug', enableSourceSlug).select('id,slug').single();
  if (error || !data) throw new Error('Could not enable source ' + enableSourceSlug + ': ' + (error?.message || 'not found'));
  console.log('Source enabled after explicit operator confirmation: ' + data.slug);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
