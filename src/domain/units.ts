export type BaseUnit = 'g' | 'ml' | 'unit';

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizePriceText(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[٫٬]/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a pack-size label to integer base units:
 * g for mass, ml for volume, and unit for countable items.
 * Returns null rather than guessing when the label is ambiguous.
 */
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
  const hasPackCount = Boolean(multiplier);

  if (baseUnit === 'g') {
    if (hasKg) return Math.round(amount * 1000);
    if (hasGram || (!hasLiter && !hasMl && !hasCount && !hasPackCount)) return Math.round(amount);
    return null;
  }
  if (baseUnit === 'ml') {
    if (hasLiter) return Math.round(amount * 1000);
    if (hasMl) return Math.round(amount);
    return null;
  }
  if (hasPackCount) return Number(multiplier?.[1]) || null;
  if (hasCount || /^(?:1\s*)?(?:unit|piece|pc|unité|حبة|قطعة)$/.test(text)) return Math.round(amount);
  return null;
}

/** Integer-only rounded division (half up), suitable for persisted minor-unit prices. */
export function pricePerBaseUnitMinor(totalPriceMinor: number, baseQuantity: number): number | null {
  if (!Number.isSafeInteger(totalPriceMinor) || totalPriceMinor <= 0) return null;
  if (!Number.isSafeInteger(baseQuantity) || baseQuantity <= 0) return null;
  const price = BigInt(totalPriceMinor);
  const quantity = BigInt(baseQuantity);
  const rounded = (price + quantity / 2n) / quantity;
  const result = Number(rounded);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
