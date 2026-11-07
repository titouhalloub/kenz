import { describe, expect, it } from 'vitest';
import { normalizePriceText, parsePackQuantity, pricePerBaseUnitMinor } from './units';

describe('normalizePriceText', () => {
  it('normalizes Arabic-Indic digits and Arabic decimal punctuation', () => {
    expect(normalizePriceText('١٫٥ كغ')).toBe('1.5 كغ');
  });
});

describe('parsePackQuantity', () => {
  it.each([
    ['1 kg', 'kg', 1000], ['500 g', 'kg', 500], ['1,5 kg', 'kg', 1500], ['6x100g', 'kg', 600],
    ['١ كغ', 'kg', 1000], ['1 L', 'l', 1000], ['500 ml', 'l', 500], ['4x1L', 'l', 4000],
    ['12 eggs', 'unit', 12], ['pack x6', 'unit', 6], ['6 حبات', 'unit', 6],
  ] as const)('parses %s as %s milli-units', (label, unit, expected) => {
    expect(parsePackQuantity(label, unit)).toBe(expected);
  });

  it('rejects ambiguous or incompatible units instead of guessing', () => {
    expect(parsePackQuantity('1 L', 'kg')).toBeNull();
    expect(parsePackQuantity('500 g', 'l')).toBeNull();
    expect(parsePackQuantity('large pack', 'unit')).toBeNull();
    expect(parsePackQuantity('500', 'kg')).toBeNull();
  });
});

describe('pricePerBaseUnitMinor', () => {
  it('calculates integer minor-unit prices per kg, litre, or piece', () => {
    expect(pricePerBaseUnitMinor(10000, 1000, 'kg')).toBe(10000);
    expect(pricePerBaseUnitMinor(5000, 500, 'kg')).toBe(10000);
    expect(pricePerBaseUnitMinor(10000, 1000, 'l')).toBe(10000);
    expect(pricePerBaseUnitMinor(100, 3, 'unit')).toBe(33);
  });
  it('rounds half up and rejects invalid values', () => {
    expect(pricePerBaseUnitMinor(101, 2, 'unit')).toBe(51);
    expect(pricePerBaseUnitMinor(0, 10, 'kg')).toBeNull();
    expect(pricePerBaseUnitMinor(100, 0, 'kg')).toBeNull();
    expect(pricePerBaseUnitMinor(1.5, 2, 'kg')).toBeNull();
  });
});
