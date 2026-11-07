import type { BaseUnit } from './productCatalog';
export type { BaseUnit } from './productCatalog';

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizePriceText(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .normalize('NFKC').toLocaleLowerCase().replace(/[٫٬]/g, '.').replace(/\s+/g, ' ').trim();
}

/** Returns integer milli-units: grams for kg products, millilitres for litre products, and pieces for unit products. */
export function parsePackQuantity(label: string, baseUnit: BaseUnit): number | null {
  const text = normalizePriceText(label).replace(/,/g, '.');
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!numberMatch) return null;
  const amount = Number(numberMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const hasKg = /\bkg\b|كغ|كلغ|كيلوغرام/.test(text);
  const hasGram = /\bg\b|gram|gramme|غرام|غ\b/.test(text);
  const hasLiter = /\bl\b|litre|liter|لتر/.test(text);
  const hasMl = /\bml\b|millilitre|milliliter|ملل?/.test(text);
  const hasCount = /\b(units?|pieces?|pcs?|eggs?)\b|وحدات|حبات|قطعة|بيض/.test(text);
  const multiplier = /(?:x|×|\*)\s*(\d+)/.exec(text);

  if (baseUnit === 'kg') {
    if (hasKg) return Math.round(amount * 1000);
    if (hasGram) return Math.round(amount);
    return null;
  }
  if (baseUnit === 'l') {
    if (hasLiter) return Math.round(amount * 1000);
    if (hasMl) return Math.round(amount);
    return null;
  }
  if (multiplier) return Number(multiplier[1]) || null;
  if (hasCount || /^(?:1\s*)?(?:unit|piece|pc|unité|حبة|قطعة)$/.test(text)) return Math.round(amount);
  return null;
}

/** Integer-only rounded price per kg, litre, or piece. */
export function pricePerBaseUnitMinor(totalPriceMinor: number, quantityMilliUnits: number, baseUnit: BaseUnit): number | null {
  if (!Number.isSafeInteger(totalPriceMinor) || totalPriceMinor <= 0) return null;
  if (!Number.isSafeInteger(quantityMilliUnits) || quantityMilliUnits <= 0) return null;
  const scale = baseUnit === 'unit' ? 1n : 1000n;
  const numerator = BigInt(totalPriceMinor) * scale;
  const denominator = BigInt(quantityMilliUnits);
  const result = Number((numerator + denominator / 2n) / denominator);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
