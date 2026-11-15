import { getSupabaseClient } from './supabase';
import type { SimulatorPrice } from '../domain/simulator';
import { DEFAULT_PRICE_WINDOWS, resolvePriceWindows, type PriceWindows } from '../domain/priceWindow';

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
const PRICE_REQUEST_TIMEOUT_MS = 10_000;

function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Market price request timed out.')), timeoutMs);
    Promise.resolve(request).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

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

export function readCachedMarketPrices(slugs: string[], wilayaCode?: string | null): MarketPriceLoadResult | null {
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

export function writeCachedMarketPrices(
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
  return readCachedMarketPrices(slugs, wilayaCode) || { pricesBySlug: {}, unavailableReason: reason };
}

let cachedWindows: { value: PriceWindows; at: number } | null = null;

/** Freshness windows configured in the database (migration 057); defaults when unavailable. */
async function loadConfiguredWindows(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<PriceWindows> {
  if (cachedWindows && Date.now() - cachedWindows.at < 10 * 60 * 1000) return cachedWindows.value;
  let value = DEFAULT_PRICE_WINDOWS;
  try {
    const { data, error } = await withTimeout(supabase.rpc('get_price_windows'), PRICE_REQUEST_TIMEOUT_MS);
    if (!error && data) value = resolvePriceWindows(Array.isArray(data) ? data[0] : data);
  } catch {
    // keep defaults
  }
  cachedWindows = { value, at: Date.now() };
  return value;
}

/**
 * Reads PUBLISHED aggregates only (get_area_prices over price_stats): no external fetching, no
 * personal budget data sent. Each price carries its observation date, source tiers and area level.
 */
export async function loadMarketPrices(productSlugs: string[], wilayaCode?: string | null): Promise<MarketPriceLoadResult> {
  const slugs = [...new Set(productSlugs.filter((slug) => /^[a-z0-9-]{1,80}$/.test(slug)))];
  if (slugs.length === 0) return { pricesBySlug: {}, unavailableReason: 'no_data' };
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable('not_configured', slugs, wilayaCode);

  try {
    const productsResult = await withTimeout(
      supabase.from('products').select('id, slug').in('slug', slugs),
      PRICE_REQUEST_TIMEOUT_MS,
    );
    if (productsResult.error) return unavailable('schema_not_deployed', slugs, wilayaCode);
    const products = (productsResult.data || []) as Array<{ id: string; slug: string }>;
    if (products.length === 0) return unavailable('no_data', slugs, wilayaCode);

    const slugById = new Map(products.map((product) => [product.id, product.slug]));
    const pricesBySlug: Record<string, SimulatorPrice> = {};
    // Fresh window first; products with no fresh aggregate fall back to the extended window.
    // Either way last_observed travels with the price, so older data is never shown as fresh.
    let rpcFailed = false;
    const configured = await loadConfiguredWindows(supabase);
    const windowsToTry = [configured.freshDays, configured.extendedDays];
    for (const windowDays of windowsToTry) {
      const missing = products.filter((product) => !pricesBySlug[product.slug]);
      if (missing.length === 0) break;
      const pricesResult = await withTimeout(supabase.rpc('get_area_prices', {
        p_product_ids: missing.map((product) => product.id),
        p_wilaya_code: wilayaCode && /^\d{2,3}$/.test(wilayaCode) ? wilayaCode : null,
        p_commune_id: null,
        p_geo_cell: null,
        p_window_days: windowDays,
      }), PRICE_REQUEST_TIMEOUT_MS);
      if (pricesResult.error) { rpcFailed = windowDays === windowsToTry[0]; if (rpcFailed) break; continue; }
      collectPriceRows((pricesResult.data || []) as Array<Record<string, unknown>>, slugById, pricesBySlug);
    }
    if (rpcFailed) return unavailable('schema_not_deployed', slugs, wilayaCode);
    if (Object.keys(pricesBySlug).length === 0) return unavailable('no_data', slugs, wilayaCode);
    const fetchedAt = writeCachedMarketPrices(slugs, wilayaCode, pricesBySlug);
    return { pricesBySlug, source: 'live', fetchedAt };
  } catch {
    return unavailable('no_data', slugs, wilayaCode);
  }
}

function collectPriceRows(
  rows: Array<Record<string, unknown>>,
  slugById: Map<string, string>,
  pricesBySlug: Record<string, SimulatorPrice>,
) {
  {
    for (const row of rows) {
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
        origin: 'market',
      };
    }
  }
}
