import { describe, expect, it } from 'vitest';
import { matchProductTitle } from './match';

const aliases = [
  { productSlug: 'tomate', alias: 'Tomate', locale: 'fr' as const },
  { productSlug: 'tomate', alias: 'طماطم', locale: 'ar' as const },
  { productSlug: 'pomme-de-terre', alias: 'Pomme de terre', locale: 'fr' as const },
  { productSlug: 'pomme-de-terre', alias: 'بطاطا', locale: 'ar' as const },
];

describe('matchProductTitle', () => {
  it('matches exact French and Arabic aliases, ignoring pack size', () => {
    expect(matchProductTitle('Tomate 1 kg', aliases).matchedSlug).toBe('tomate');
    expect(matchProductTitle('طماطم', aliases).matchedSlug).toBe('tomate');
  });

  it('returns fuzzy candidates for review without auto-accepting them', () => {
    const result = matchProductTitle('Tomattes', aliases);
    expect(result.matchedSlug).toBeNull();
    expect(result.suggestions[0]?.productSlug).toBe('tomate');
  });

  it('returns no match for an empty title', () => {
    expect(matchProductTitle('  ', aliases)).toEqual({ matchedSlug: null, suggestions: [] });
  });
});
