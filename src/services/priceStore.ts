import { getSupabaseClient } from './supabase';
import type { SimulatorPrice } from '../domain/simulator';

export interface MarketPriceLoadResult {
  pricesBySlug: Record<string, SimulatorPrice>;
  unavailableReason?: 'not_configured' | 'schema_not_deployed' | 'no_data';
  source?: 'live' | 'cache';
  fetchedAt?: string;
}

interface MarketPriceCache {
  version: 1;
  fetchedAt: string;
  pricesBySlug: Record<string, SimulatorPrice>;
}

const CACHE_PREFIX = 'kenz:public-market-prices:v1:';

function cacheKey(slugs: string[], wilayaCode?: string | null): string {
  return CACHE_PREFIX + (wilayaCode || 'DZ') + ':' + [...slugs].sort().join(',');
}

function isPrice(value: unknown): value is SimulatorPrice {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SimulatorPrice>;
  return row.currency === 'DZD' &&
    [row.p25UnitPriceMinor, row.medianUnitPriceMinor, row.p75UnitPriceMinor,
      row.nObservations, row.nContributors].every((number) => Number.isSafeInteger(number)) &&
    Number(row.p25UnitPriceMinor) > 0 &&
    Number(row.p25UnitPriceMinor) <= Number(row.medianUnitPriceMinor) &&
    Number(row.medianUnitPriceMinor) <= Number(row.p75UnitPriceMinor) &&
    Number(row.nObservations) >= 0 && Number(row.nContributors) >= 0 &&
    typeof row.lastObserved === 'string' &&
    ['neighborhood', 'commune', 'wilaya', 'national'].includes(String(row.areaLevel));
}

function readCache(slugs: string[], wilayaCode?: string | null): MarketPriceLoadResult | null {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(slugs, wilayaCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MarketPriceCache>;
    if (parsed.version !== 1 || typeof parsed.fetchedAt !== 'string' ||
        !parsed.pricesBySlug || typeof parsed.pricesBySlug !== 'object') return null;
    const pricesBySlug = Object.fromEntries(
      Object.entries(parsed.pricesBySlug).filter(([slug, price]) => slugs.includes(slug) && isPrice(price)),
    ) as Record<string, SimulatorPrice>;
    if (Object.keys(pricesBySlug).length === 0) return null;
    return { pricesBySlug, source: 'cache', fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(
  slugs: string[],
  wilayaCode: string | null | undefined,
  pricesBySlug: Record<string, SimulatorPrice>,
): string {
  const fetchedAt = new Date().toISOString();
  try {
    globalThis.localStorage?.setItem(cacheKey(slugs, wilayaCode), JSON.stringify({
      version: 1, fetchedAt, pricesBySlug,
    } satisfies MarketPriceCache));
  } catch {
    // Storage can be unavailable or full; live results remain usable for this session.
  }
  return fetchedAt;
}

function unavailable(
  reason: NonNullable<MarketPriceLoadResult['unavailableReason']>,
  slugs: string[],
  wilayaCode?: string | null,
): MarketPriceLoadResult {
  return readCache(slugs, wilayaCode) || { pricesBySlug: {}, unavailableReason: reason };
}

/** Reads public market aggregates only; no personal budget data is accepted or sent. */
export async function loadMarketPrices(productSlugs: string[], wilayaCode?: string | null): Promise<MarketPriceLoadResult> {
  const slugs = [...new Set(productSlugs.filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug)))];
  if (slugs.length === 0) return { pricesBySlug: {}, unavailableReason: 'no_data' };
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable('not_configured', slugs, wilayaCode);

  try {
    const productsResult = await supabase.from('products').select('id, slug').in('slug', slugs);
    if (productsResult.error) return unavailable('schema_not_deployed', slugs, wilayaCode);
    const products = (productsResult.data || []) as Array<{ id: string; slug: string }>;
    if (products.length === 0) return unavailable('no_data', slugs, wilayaCode);

    const pricesResult = await supabase.rpc('get_area_prices', {
      p_product_ids: products.map((product) => product.id),
      p_wilaya_code: wilayaCode && /^\\d{2,3}$/.test(wilayaCode) ? wilayaCode : null,
      p_commune_id: null,
      p_geo_cell: null,
      p_window_days: 14,
    });
    if (pricesResult.error) return unavailable('schema_not_deployed', slugs, wilayaCode);

    const slugById = new Map(products.map((product) => [product.id, product.slug]));
    const pricesBySlug: Record<string, SimulatorPrice> = {};
    for (const row of (pricesResult.data || []) as Array<Record<string, unknown>>) {
      const slug = slugById.get(String(row.product_id));
      const areaLevel = row.area_level;
      if (!slug || !['neighborhood', 'commune', 'wilaya', 'national'].includes(String(areaLevel))) continue;
      const p25 = Number(row.p25_unit_price_minor);
      const median = Number(row.median_unit_price_minor);
      const p75 = Number(row.p75_unit_price_minor);
      const nObservations = Number(row.n_observations);
      const nContributors = Number(row.n_contributors);
      if (![p25, median, p75, nObservations, nContributors].every(Number.isSafeInteger) ||
          p25 <= 0 || p25 > median || median > p75 || nObservations < 0 || nContributors < 0 ||
          typeof row.last_observed !== 'string' || !Number.isFinite(Date.parse(row.last_observed))) continue;
      pricesBySlug[slug] = {
        currency: 'DZD',
        p25UnitPriceMinor: p25,
        medianUnitPriceMinor: median,
        p75UnitPriceMinor: p75,
        nObservations,
        nContributors,
        lastObserved: row.last_observed,
        areaLevel: areaLevel as SimulatorPrice['areaLevel'],
        sourceTiers: Array.isArray(row.source_tiers) ? row.source_tiers.map(String) : [],
      };
    }
    if (Object.keys(pricesBySlug).length === 0) return unavailable('no_data', slugs, wilayaCode);
    const fetchedAt = writeCache(slugs, wilayaCode, pricesBySlug);
    return { pricesBySlug, source: 'live', fetchedAt };
  } catch {
    return unavailable('no_data', slugs, wilayaCode);
  }
}
