import { normalizePriceText } from '../../src/domain/units';

export interface ProductAliasCandidate {
  productSlug: string;
  alias: string;
  locale?: 'ar' | 'fr' | 'en';
}

export interface ProductMatchResult {
  matchedSlug: string | null;
  suggestions: Array<{ productSlug: string; score: number }>;
}

function normalizeAlias(value: string): string {
  return normalizePriceText(value)
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/** Exact aliases auto-match; fuzzy matches are suggestions only and must be reviewed. */
export function matchProductTitle(
  title: string,
  aliases: ProductAliasCandidate[],
  suggestionThreshold = 0.55,
): ProductMatchResult {
  const normalizedTitle = normalizeAlias(title);
  if (!normalizedTitle) return { matchedSlug: null, suggestions: [] };

  const exact = aliases.find((candidate) => normalizeAlias(candidate.alias) === normalizedTitle);
  if (exact) return { matchedSlug: exact.productSlug, suggestions: [] };

  const bestByProduct = new Map<string, number>();
  for (const candidate of aliases) {
    const score = similarity(normalizedTitle, normalizeAlias(candidate.alias));
    if (score >= suggestionThreshold) {
      bestByProduct.set(candidate.productSlug, Math.max(bestByProduct.get(candidate.productSlug) || 0, score));
    }
  }

  const suggestions = [...bestByProduct.entries()]
    .map(([productSlug, score]) => ({ productSlug, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return { matchedSlug: null, suggestions };
}
