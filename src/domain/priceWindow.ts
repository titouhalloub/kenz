/**
 * Freshness windows for published price aggregates (price_stats.window_days).
 *
 * FRESH: preferred window (default 14 days).
 * EXTENDED: fallback window (default 30 days) for sources that publish rarely.
 *
 * The defaults below are only fallbacks: the database keeps the configured values in
 * `price_engine_settings` and exposes them through `get_price_windows()` (migration 057).
 * Old observations are never presented as fresh: every published price carries its
 * last_observed date and the simulator flags it as stale after the fresh window.
 */
export const PRICE_FRESH_WINDOW_DAYS = 14;
export const PRICE_EXTENDED_WINDOW_DAYS = 30;

export interface PriceWindows {
  freshDays: number;
  extendedDays: number;
}

export const DEFAULT_PRICE_WINDOWS: PriceWindows = {
  freshDays: PRICE_FRESH_WINDOW_DAYS,
  extendedDays: PRICE_EXTENDED_WINDOW_DAYS,
};

/** Windows the database keeps aggregates for, preferred first. */
export const PRICE_STATS_WINDOWS: readonly number[] = [PRICE_FRESH_WINDOW_DAYS, PRICE_EXTENDED_WINDOW_DAYS];

/** Validates configured windows (1 ≤ fresh < extended ≤ 90); anything else falls back to the defaults. */
export function resolvePriceWindows(value: unknown): PriceWindows {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const fresh = Number(row.fresh_days ?? row.freshDays);
  const extended = Number(row.extended_days ?? row.extendedDays);
  if (Number.isInteger(fresh) && Number.isInteger(extended) && fresh >= 1 && fresh < extended && extended <= 90) {
    return { freshDays: fresh, extendedDays: extended };
  }
  return DEFAULT_PRICE_WINDOWS;
}

/**
 * Lifecycle shown to moderators. `status` is the stored review status; `expired` is derived from the
 * observation date (nothing older than the extended window can reach a published aggregate).
 * Manual estimates typed by a user are not observations and never appear here.
 */
export type PriceLifecycle = 'pending' | 'verified' | 'rejected' | 'expired';

export function priceLifecycle(
  status: 'pending' | 'accepted' | 'rejected',
  observedAt: string,
  now: Date,
  windows: PriceWindows = DEFAULT_PRICE_WINDOWS,
): PriceLifecycle {
  if (status === 'rejected') return 'rejected';
  const ageDays = (now.getTime() - Date.parse(observedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > windows.extendedDays) return 'expired';
  return status === 'accepted' ? 'verified' : 'pending';
}
