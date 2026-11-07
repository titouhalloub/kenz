import { describe, expect, it } from 'vitest';
import { normalizePriceText, parsePackQuantity, pricePerBaseUnitMinor } from './units';

describe('normalizePriceText', () => {
  it('normalizes Arabic-Indic digits and Arabic decimal punctuation', () => {
    expect(normalizePriceText('١٫٥ كغ')).toBe('1.5 كغ');
  });
});

describe('parsePackQuantity', () => {
  it.each([
    ['1 kg', 'g', 1000],
    ['500 g', 'g', 500],
    ['1,5 kg', 'g', 1500],
    ['١ كغ', 'g', 1000],
    ['1 L', 'ml', 1000],
    ['500 ml', 'ml', 500],
    ['12 eggs', 'unit', 12],
    ['pack x6', 'unit', 6],
    ['6 حبات', 'unit', 6],
  ] as const)('parses %s as %s base units', (label, unit, expected) => {
    expect(parsePackQuantity(label, unit)).toBe(expected);
  });

  it('rejects ambiguous or incompatible units instead of guessing', () => {
    expect(parsePackQuantity('1 L', 'g')).toBeNull();
    expect(parsePackQuantity('500 g', 'ml')).toBeNull();
    expect(parsePackQuantity('large pack', 'unit')).toBeNull();
    expect(parsePackQuantity('500', 'g')).toBeNull();
  });
});

describe('pricePerBaseUnitMinor', () => {
  it('uses integer rounding without floating-point persistence', () => {
    expect(pricePerBaseUnitMinor(10000, 1000)).toBe(10);
    expect(pricePerBaseUnitMinor(100, 3)).toBe(33);
    expect(pricePerBaseUnitMinor(101, 2)).toBe(51);
  });

  it('rejects invalid values', () => {
    expect(pricePerBaseUnitMinor(0, 10)).toBeNull();
    expect(pricePerBaseUnitMinor(100, 0)).toBeNull();
    expect(pricePerBaseUnitMinor(1.5, 2)).toBeNull();
  });
});
