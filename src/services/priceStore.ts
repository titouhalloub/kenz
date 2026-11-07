import { getSupabaseClient } from './supabase';
import type { SimulatorPrice } from '../domain/simulator';

export interface MarketPriceLoadResult {
  pricesBySlug: Record<string, SimulatorPrice>;
  unavailableReason?: 'not_configured' | 'schema_not_deployed' | 'no_data';
}

/**
 * Loads public market statistics only. This function never receives or reads
 * the user's budget, income, balances, transactions, or savings data.
 */
export async function loadMarketPrices(productSlugs: string[]): Promise<MarketPriceLoadResult> {
  const slugs = [...new Set(productSlugs.filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug)))];
  if (slugs.length === 0) return { pricesBySlug: {}, unavailableReason: 'no_data' };

  const supabase = getSupabaseClient();
  if (!supabase) return { pricesBySlug: {}, unavailableReason: 'not_configured' };

  const productsResult = await supabase.from('products').select('id, slug').in('slug', slugs);
  if (productsResult.error) return { pricesBySlug: {}, unavailableReason: 'schema_not_deployed' };
  const products = (productsResult.data || []) as Array<{ id: string; slug: string }>;
  if (products.length === 0) return { pricesBySlug: {}, unavailableReason: 'no_data' };

  const pricesResult = await supabase.rpc('get_area_prices', {
    p_product_ids: products.map((product) => product.id),
    p_wilaya_code: null,
    p_commune_id: null,
    p_geo_cell: null,
    p_window_days: 14,
  });
  if (pricesResult.error) return { pricesBySlug: {}, unavailableReason: 'schema_not_deployed' };

  const slugById = new Map(products.map((product) => [product.id, product.slug]));
  const pricesBySlug: Record<string, SimulatorPrice> = {};
  for (const row of (pricesResult.data || []) as Array<Record<string, unknown>>) {
    const slug = slugById.get(String(row.product_id));
    const areaLevel = row.area_level;
    if (!slug || !['neighborhood','commune','wilaya','national'].includes(String(areaLevel))) continue;
    const p25 = Number(row.p25_unit_price_minor);
    const median = Number(row.median_unit_price_minor);
    const p75 = Number(row.p75_unit_price_minor);
    const nObservations = Number(row.n_observations);
    const nContributors = Number(row.n_contributors);
    if (![p25, median, p75, nObservations, nContributors].every(Number.isSafeInteger) ||
        p25 <= 0 || p25 > median || median > p75 || nObservations < 0 || nContributors < 0) continue;

    pricesBySlug[slug] = {
      currency: 'DZD',
      p25UnitPriceMinor: p25,
      medianUnitPriceMinor: median,
      p75UnitPriceMinor: p75,
      nObservations,
      nContributors,
      lastObserved: String(row.last_observed || ''),
      areaLevel: areaLevel as SimulatorPrice['areaLevel'],
    };
  }
  return {
    pricesBySlug,
    ...(Object.keys(pricesBySlug).length === 0 ? { unavailableReason: 'no_data' as const } : {}),
  };
}
