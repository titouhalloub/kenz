import { getCatalogProduct, type BaseUnit } from './productCatalog';
import type { SimulatorBasketItem, SimulatorPrice } from './simulator';

/** Indicative daily quantities per person. Editable by the user; they are NOT prices and not recommendations. */
export const STARTER_BASKET: ReadonlyArray<{ slug: string; perDay: number }> = [
  // kg / l products: grams or millilitres per person per day. unit products: pieces per person per day.
  { slug: 'semoule-ordinaire', perDay: 100 },
  { slug: 'pates-spaghetti', perDay: 40 },
  { slug: 'riz', perDay: 30 },
  { slug: 'baguette', perDay: 0.7 },
  { slug: 'huile-table', perDay: 30 },
  { slug: 'sucre', perDay: 35 },
  { slug: 'lait-sachet', perDay: 250 },
  { slug: 'oeufs', perDay: 0.3 },
  { slug: 'pomme-de-terre', perDay: 150 },
  { slug: 'tomate', perDay: 100 },
  { slug: 'oignon', perDay: 60 },
  { slug: 'poulet-frais', perDay: 70 },
  { slug: 'lentilles', perDay: 25 },
  { slug: 'orange', perDay: 80 },
];

/** Pieces are stored as thousandths of a piece, grams/ml as-is (milli-kg / milli-litre). */
export function toMilliUnits(unit: BaseUnit, perDay: number): number {
  return Math.round(unit === 'unit' ? perDay * 1000 : perDay);
}

/** One typed "usual price" becomes a low/usual/high range of -10% / 0 / +10%. */
export function manualPriceRange(usualMinor: number, nowIso: string): SimulatorPrice {
  return {
    currency: 'DZD',
    p25UnitPriceMinor: Math.round(usualMinor * 0.9),
    medianUnitPriceMinor: usualMinor,
    p75UnitPriceMinor: Math.round(usualMinor * 1.1),
    nObservations: 0,
    nContributors: 0,
    lastObserved: nowIso,
    areaLevel: 'national',
  };
}

export interface QuickRow { slug: string; qty: string; price: string; market?: SimulatorPrice }

export function quickRowsToItems(
  rows: QuickRow[],
  names: (slug: string) => string,
  parsePriceMinor: (value: string) => number,
  nowIso: string,
): SimulatorBasketItem[] {
  const items: SimulatorBasketItem[] = [];
  for (const row of rows) {
    const product = getCatalogProduct(row.slug);
    const qty = Number(String(row.qty).replace(',', '.'));
    if (!product || !(qty > 0)) continue;
    const priceMinor = parsePriceMinor(row.price);
    const untouchedMarket = row.market && priceMinor === row.market.medianUnitPriceMinor;
    const price = untouchedMarket ? row.market! : priceMinor > 0 ? manualPriceRange(priceMinor, nowIso) : null;
    if (!price) continue;
    items.push({
      productId: product.slug, name: names(product.slug), category: product.category, baseUnit: product.baseUnit,
      ...(product.substituteGroup ? { substituteGroup: product.substituteGroup } : {}),
      quantityPerPersonPerDayMilliUnits: toMilliUnits(product.baseUnit, qty), price,
    });
  }
  return items;
}
