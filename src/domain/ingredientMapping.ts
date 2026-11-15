/**
 * Ingredient → catalog product mapping layer.
 *
 * Recipes and shopping lists use free-text names (Arabic / French / English) and
 * g / ml / piece quantities. The price catalog uses stable product slugs with a
 * base unit (kg, l, unit). This module is the only place where the two meet.
 *
 * Rules:
 *  - A name is mapped only when it matches a catalog name or a curated alias
 *    exactly (after normalisation), or when the recipe author set `productId`.
 *  - Ambiguous names (oil, pasta, milk, semolina…) and processed forms (cooked,
 *    canned) are NEVER mapped on their own: they stay UNPRICED.
 *  - Units are converted only through explicit, valid conversions. g↔kg and
 *    ml↔l are exact. piece→unit is exact for unit products. piece→g needs a
 *    declared average piece weight and is flagged as approximate. Anything else
 *    (g for a litre product, ml for a kg product…) is UNPRICED.
 *  - No price is produced here. Phase 4 prices only `mapped` rows.
 */
import { PRODUCT_CATALOG, getCatalogProduct, type BaseUnit, type CatalogProduct } from './productCatalog';

export type IngredientUnit = 'g' | 'ml' | 'piece';

export type UnpricedReason =
  | 'unmapped'            // no catalog product matches this name
  | 'ambiguous'           // several products could match; the user must choose
  | 'processed_form'      // cooked / canned / prepared: catalog prices the raw product
  | 'invalid_mapping'     // an explicit productId that is not in the catalog
  | 'incompatible_unit'   // no valid conversion between the recipe unit and the product base unit
  | 'ambiguous_piece';    // "piece" has no declared average weight for this product

export type ProductResolution =
  | { status: 'mapped'; productId: string; source: 'explicit' | 'alias' }
  | { status: 'unpriced'; reason: Exclude<UnpricedReason, 'incompatible_unit' | 'ambiguous_piece'>; candidates?: string[] };

/** Canonical working unit for each catalog base unit (exact, integer-friendly). */
export const CANONICAL_UNIT: Record<BaseUnit, IngredientUnit> = { kg: 'g', l: 'ml', unit: 'piece' };

/**
 * Average weight of one "piece" in grams, for products priced per kg.
 * These are declared approximations (medium size). A product absent from this
 * table cannot be converted from pieces and stays UNPRICED (e.g. garlic: a
 * clove and a head differ ~10x, so "1 piece of garlic" is ambiguous).
 */
export const PIECE_WEIGHT_GRAMS: Readonly<Record<string, number>> = {
  tomate: 120,
  oignon: 110,
  carotte: 80,
  courgette: 200,
  navet: 150,
  concombre: 200,
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Lower-cases, removes accents/tashkeel, unifies Arabic letter variants and a leading "ال". */
export function normalizeIngredientName(raw: string): string {
  let text = raw.normalize('NFKD').replace(/[̀-ًͯ-ٰٟـ]/g, '').toLocaleLowerCase();
  text = text.replace(/œ/g, 'oe').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[’'`]/g, ' ');
  text = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  text = normalizeSpaces(text.replace(/-/g, ' '));
  if (text.startsWith('ال') && text.length > 4 && !text.includes(' ')) text = text.slice(2);
  return text;
}

/** Extra spellings on top of the catalog's own FR/AR/EN names. Exact products only. */
const CURATED_ALIASES: Record<string, string[]> = {
  tomate: ['tomates', 'tomato', 'tomatoes', 'طماطم', 'طماطه'],
  oignon: ['oignons', 'onion', 'onions', 'بصل', 'بصله'],
  carotte: ['carottes', 'carrot', 'carrots', 'جزر'],
  ail: ['garlic', 'ثوم'],
  courgette: ['courgettes', 'zucchini', 'zucchinis', 'كوسه', 'كوسا'],
  navet: ['navets', 'turnip', 'turnips', 'لفت'],
  concombre: ['concombres', 'cucumber', 'cucumbers', 'خيار'],
  lentilles: ['lentille', 'lentil', 'lentils', 'عدس'],
  'pois-chiches': ['pois chiche', 'chickpea', 'chickpeas', 'حمص'],
  oeufs: ['oeuf', 'egg', 'eggs', 'بيض', 'بيضه'],
  couscous: ['كسكس', 'كسكسي'],
  riz: ['rice', 'ارز', 'رز'],
  sucre: ['sugar', 'سكر'],
  sel: ['salt', 'ملح'],
  'pomme-de-terre': ['pommes de terre', 'potato', 'potatoes', 'بطاطا', 'بطاطس'],
  'huile-table': ['huile de table', 'table oil', 'cooking oil', 'زيت المائده', 'زيت الطبخ'],
  'pates-spaghetti': ['spaghetti', 'spaghettis', 'سباغيتي', 'اسباغيتي'],
};

/** Names that look like a product but could be several. They never resolve on their own. */
const AMBIGUOUS_NAMES: Record<string, string[]> = {
  'زيت': ['huile-table'], huile: ['huile-table'], oil: ['huile-table'],
  'معكرونه': ['pates-spaghetti'], pates: ['pates-spaghetti'], pate: ['pates-spaghetti'], pasta: ['pates-spaghetti'],
  'حليب': ['lait-sachet', 'lait-poudre'], lait: ['lait-sachet', 'lait-poudre'], milk: ['lait-sachet', 'lait-poudre'],
  'سميد': ['semoule-ordinaire', 'semoule-fine'], semoule: ['semoule-ordinaire', 'semoule-fine'], semolina: ['semoule-ordinaire', 'semoule-fine'],
  'دقيق': ['farine-ble-tendre'], farine: ['farine-ble-tendre'], flour: ['farine-ble-tendre'],
  'لحم': ['viande-bovine-locale', 'viande-ovine'], viande: ['viande-bovine-locale', 'viande-ovine'], meat: ['viande-bovine-locale', 'viande-ovine'],
  'فلفل': ['poivron', 'piment-piquant', 'poivre-noir'], poivre: ['poivron', 'piment-piquant', 'poivre-noir'], pepper: ['poivron', 'piment-piquant', 'poivre-noir'],
  lessive: ['lessive-poudre'], 'مسحوق غسيل': ['lessive-poudre'], detergent: ['lessive-poudre', 'liquide-vaisselle'],
};

/** Words that turn a raw product into a processed one the catalog does not price. */
const PROCESSED_MARKERS = [
  'مطبوخ', 'مطبوخه', 'معلب', 'مجفف', 'مقلي', 'مسلوق', 'مهروس', 'مطحون',
  'cuit', 'cuite', 'cuits', 'cuites', 'conserve', 'boite', 'surgele', 'frit', 'frite', 'puree',
  'cooked', 'canned', 'tinned', 'frozen', 'fried', 'boiled', 'mashed', 'ground', 'dried',
];

let aliasIndex: Map<string, string> | null = null;
let ambiguousIndex: Map<string, string[]> | null = null;

function buildIndexes() {
  const index = new Map<string, string>();
  const clash = new Set<string>();
  const add = (alias: string, slug: string) => {
    const key = normalizeIngredientName(alias);
    if (!key) return;
    const existing = index.get(key);
    if (existing && existing !== slug) { clash.add(key); return; }
    index.set(key, slug);
  };
  for (const product of PRODUCT_CATALOG) {
    add(product.slug.replace(/-/g, ' '), product.slug);
    add(product.nameFr, product.slug);
    add(product.nameAr, product.slug);
    add(product.nameEn, product.slug);
  }
  for (const [slug, aliases] of Object.entries(CURATED_ALIASES)) {
    if (!getCatalogProduct(slug)) continue;
    for (const alias of aliases) add(alias, slug);
  }
  // A spelling shared by two products is ambiguous by definition.
  for (const key of clash) index.delete(key);
  const ambiguous = new Map<string, string[]>();
  for (const [name, candidates] of Object.entries(AMBIGUOUS_NAMES)) {
    const key = normalizeIngredientName(name);
    ambiguous.set(key, candidates.filter((slug) => Boolean(getCatalogProduct(slug))));
    index.delete(key);
  }
  for (const key of clash) {
    if (!ambiguous.has(key)) {
      ambiguous.set(key, PRODUCT_CATALOG.filter((product) => [product.nameFr, product.nameAr, product.nameEn].some((n) => normalizeIngredientName(n) === key)).map((product) => product.slug));
    }
  }
  aliasIndex = index;
  ambiguousIndex = ambiguous;
}

const hasProcessedMarker = (normalized: string) => {
  const words = normalized.split(' ');
  return PROCESSED_MARKERS.some((marker) => words.includes(normalizeIngredientName(marker)));
};

/**
 * Resolves a free-text ingredient to a catalog product.
 * `explicitProductId` is the recipe author's own structured mapping and wins
 * when valid; when it is not in the catalog the result is `invalid_mapping`
 * (we do NOT fall back to guessing from the name).
 */
export function resolveProduct(name: string, explicitProductId?: string): ProductResolution {
  if (!aliasIndex || !ambiguousIndex) buildIndexes();
  if (explicitProductId !== undefined) {
    return getCatalogProduct(explicitProductId)
      ? { status: 'mapped', productId: explicitProductId, source: 'explicit' }
      : { status: 'unpriced', reason: 'invalid_mapping' };
  }
  const normalized = normalizeIngredientName(name);
  if (!normalized) return { status: 'unpriced', reason: 'unmapped' };
  const ambiguousCandidates = ambiguousIndex!.get(normalized);
  if (ambiguousCandidates) return { status: 'unpriced', reason: 'ambiguous', candidates: ambiguousCandidates };
  // An exact catalog name wins (e.g. "Thon en conserve" IS the canned-tuna product); the processed-form
  // check only applies to names that are not themselves a catalog product.
  const slug = aliasIndex!.get(normalized);
  if (slug) return { status: 'mapped', productId: slug, source: 'alias' };
  if (hasProcessedMarker(normalized)) return { status: 'unpriced', reason: 'processed_form' };
  return { status: 'unpriced', reason: 'unmapped' };
}

export type QuantityConversion =
  | {
      ok: true;
      /** Quantity in the product's canonical unit (g / ml / piece), milli-units, exact. */
      canonicalMilli: number;
      canonicalUnit: IngredientUnit;
      /** True when a declared average piece weight was needed. */
      approximate: boolean;
    }
  | { ok: false; reason: 'incompatible_unit' | 'ambiguous_piece' };

/** Converts a recipe quantity (milli g / ml / piece) to the product's canonical unit. Never guesses. */
export function convertToCanonical(product: CatalogProduct, unit: IngredientUnit, quantityMilli: number): QuantityConversion {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 0) return { ok: false, reason: 'incompatible_unit' };
  const canonicalUnit = CANONICAL_UNIT[product.baseUnit];
  if (unit === canonicalUnit) return { ok: true, canonicalMilli: quantityMilli, canonicalUnit, approximate: false };
  if (unit === 'piece' && product.baseUnit === 'kg') {
    const weight = PIECE_WEIGHT_GRAMS[product.slug];
    if (!weight) return { ok: false, reason: 'ambiguous_piece' };
    const grams = quantityMilli * weight;
    if (!Number.isSafeInteger(grams)) return { ok: false, reason: 'incompatible_unit' };
    return { ok: true, canonicalMilli: grams, canonicalUnit, approximate: true };
  }
  return { ok: false, reason: 'incompatible_unit' };
}

/**
 * Canonical milli-units → catalog base milli-units, using the simulator's convention
 * (grams ARE milli-kg, millilitres ARE milli-litres, pieces ARE milli-units).
 * 1 g = 1 000 milli-g = 1 milli-kg, so g→kg is a division by 1 000 (rounded half up).
 */
export function canonicalToBaseMilli(baseUnit: BaseUnit, canonicalMilli: number): number {
  return baseUnit === 'unit' ? canonicalMilli : Math.floor((canonicalMilli + 500) / 1000);
}

export type IngredientResolution =
  | {
      status: 'mapped';
      productId: string;
      source: 'explicit' | 'alias';
      baseUnit: BaseUnit;
      canonicalUnit: IngredientUnit;
      canonicalMilli: number;
      baseQuantityMilli: number;
      approximate: boolean;
    }
  | { status: 'unpriced'; reason: UnpricedReason; candidates?: string[] };

export function resolveIngredient(name: string, unit: IngredientUnit, quantityMilli: number, explicitProductId?: string): IngredientResolution {
  const product = resolveProduct(name, explicitProductId);
  if (product.status === 'unpriced') return product;
  const catalogProduct = getCatalogProduct(product.productId)!;
  const converted = convertToCanonical(catalogProduct, unit, quantityMilli);
  if (!converted.ok) return { status: 'unpriced', reason: converted.reason };
  return {
    status: 'mapped', productId: product.productId, source: product.source, baseUnit: catalogProduct.baseUnit,
    canonicalUnit: converted.canonicalUnit, canonicalMilli: converted.canonicalMilli,
    baseQuantityMilli: canonicalToBaseMilli(catalogProduct.baseUnit, converted.canonicalMilli), approximate: converted.approximate,
  };
}
