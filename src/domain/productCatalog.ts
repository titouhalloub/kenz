/**
 * Canonical product catalog for local price intelligence (Phase 4).
 *
 * Identity only — NO prices live here. Prices come from price sources
 * (see docs/PRICE_SOURCES.md) and are stored per observation. Each product has
 * one base unit; unit prices are always stored as integer minor units per base
 * unit (centimes per kg, per litre or per piece).
 *
 * `regulated` marks products whose consumer price is government-set in Algeria
 * (subsidized staples, fuel, butane). The flag says a regulated price exists,
 * not what it is: the figures must come from official texts with an effective
 * date, never from this file.
 */

export type BaseUnit = 'kg' | 'l' | 'unit';

export type ProductCategory =
  | 'cereals_bread'
  | 'oils_fats'
  | 'sugar_sweeteners'
  | 'dairy_eggs'
  | 'vegetables'
  | 'fruits'
  | 'meat_fish'
  | 'legumes'
  | 'spices_condiments'
  | 'beverages'
  | 'household'
  | 'fuel_energy';

export interface CatalogProduct {
  /** Stable kebab-case identifier; never renamed once shipped. */
  slug: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  category: ProductCategory;
  baseUnit: BaseUnit;
  regulated?: boolean;
}

const p = (
  slug: string,
  nameFr: string,
  nameAr: string,
  nameEn: string,
  category: ProductCategory,
  baseUnit: BaseUnit,
  regulated = false,
): CatalogProduct => ({ slug, nameFr, nameAr, nameEn, category, baseUnit, ...(regulated ? { regulated } : {}) });

export const PRODUCT_CATALOG: readonly CatalogProduct[] = [
  // Cereals & bread
  p('semoule-ordinaire', 'Semoule ordinaire', 'سميد عادي', 'Standard semolina', 'cereals_bread', 'kg', true),
  p('semoule-fine', 'Semoule fine', 'سميد رفيع', 'Fine semolina', 'cereals_bread', 'kg', true),
  p('farine-ble-tendre', 'Farine de blé tendre', 'دقيق القمح اللين', 'Soft wheat flour', 'cereals_bread', 'kg', true),
  p('baguette', 'Baguette de pain', 'خبز باغيت', 'Baguette', 'cereals_bread', 'unit', true),
  p('pates-spaghetti', 'Pâtes (spaghetti)', 'معكرونة (سباغيتي)', 'Pasta (spaghetti)', 'cereals_bread', 'kg'),
  p('couscous', 'Couscous', 'كسكس', 'Couscous', 'cereals_bread', 'kg'),
  p('riz', 'Riz', 'أرز', 'Rice', 'cereals_bread', 'kg'),

  // Oils & fats
  p('huile-table', 'Huile de table', 'زيت المائدة', 'Cooking oil', 'oils_fats', 'l', true),
  p('beurre', 'Beurre', 'زبدة', 'Butter', 'oils_fats', 'kg'),

  // Sugar & sweeteners
  p('sucre', 'Sucre', 'سكر', 'Sugar', 'sugar_sweeteners', 'kg', true),
  p('miel', 'Miel', 'عسل', 'Honey', 'sugar_sweeteners', 'kg'),

  // Dairy & eggs
  p('lait-sachet', 'Lait pasteurisé (sachet)', 'حليب مبستر (كيس)', 'Pasteurised milk (sachet)', 'dairy_eggs', 'l', true),
  p('lait-poudre', 'Lait en poudre', 'حليب مجفف', 'Powdered milk', 'dairy_eggs', 'kg'),
  p('yaourt', 'Yaourt', 'زبادي', 'Yogurt', 'dairy_eggs', 'unit'),
  p('fromage-fondu', 'Fromage fondu', 'جبن مطبوخ', 'Processed cheese', 'dairy_eggs', 'kg'),
  p('oeufs', 'Œufs', 'بيض', 'Eggs', 'dairy_eggs', 'unit'),

  // Vegetables
  p('pomme-de-terre', 'Pomme de terre', 'بطاطا', 'Potato', 'vegetables', 'kg'),
  p('tomate', 'Tomate', 'طماطم', 'Tomato', 'vegetables', 'kg'),
  p('oignon', 'Oignon', 'بصل', 'Onion', 'vegetables', 'kg'),
  p('carotte', 'Carotte', 'جزر', 'Carrot', 'vegetables', 'kg'),
  p('courgette', 'Courgette', 'كوسة', 'Zucchini', 'vegetables', 'kg'),
  p('poivron', 'Poivron', 'فلفل حلو', 'Bell pepper', 'vegetables', 'kg'),
  p('piment-piquant', 'Piment piquant', 'فلفل حار', 'Hot pepper', 'vegetables', 'kg'),
  p('aubergine', 'Aubergine', 'باذنجان', 'Eggplant', 'vegetables', 'kg'),
  p('chou-fleur', 'Chou-fleur', 'قرنبيط', 'Cauliflower', 'vegetables', 'kg'),
  p('navet', 'Navet', 'لفت', 'Turnip', 'vegetables', 'kg'),
  p('laitue', 'Laitue', 'خس', 'Lettuce', 'vegetables', 'kg'),
  p('ail', 'Ail', 'ثوم', 'Garlic', 'vegetables', 'kg'),
  p('concombre', 'Concombre', 'خيار', 'Cucumber', 'vegetables', 'kg'),
  p('haricots-verts', 'Haricots verts', 'فاصوليا خضراء', 'Green beans', 'vegetables', 'kg'),

  // Fruits
  p('orange', 'Orange', 'برتقال', 'Orange', 'fruits', 'kg'),
  p('pomme', 'Pomme', 'تفاح', 'Apple', 'fruits', 'kg'),
  p('banane', 'Banane', 'موز', 'Banana', 'fruits', 'kg'),
  p('clementine', 'Clémentine', 'كلمنتين', 'Clementine', 'fruits', 'kg'),
  p('dattes-deglet-nour', 'Dattes (Deglet Nour)', 'تمر (دقلة نور)', 'Dates (Deglet Nour)', 'fruits', 'kg'),
  p('poire', 'Poire', 'كمثرى', 'Pear', 'fruits', 'kg'),
  p('pasteque', 'Pastèque', 'بطيخ أحمر', 'Watermelon', 'fruits', 'kg'),
  p('citron', 'Citron', 'ليمون', 'Lemon', 'fruits', 'kg'),

  // Meat & fish
  p('poulet-frais', 'Poulet frais', 'دجاج طازج', 'Fresh chicken', 'meat_fish', 'kg'),
  p('viande-bovine-locale', 'Viande bovine locale', 'لحم بقري محلي', 'Local beef', 'meat_fish', 'kg'),
  p('viande-ovine', 'Viande ovine (mouton)', 'لحم الغنم', 'Mutton / lamb', 'meat_fish', 'kg'),
  p('dinde', 'Dinde', 'ديك رومي', 'Turkey', 'meat_fish', 'kg'),
  p('sardines', 'Sardines', 'سردين', 'Sardines', 'meat_fish', 'kg'),
  p('thon-conserve', 'Thon en conserve', 'تونة معلبة', 'Canned tuna', 'meat_fish', 'unit'),

  // Legumes
  p('lentilles', 'Lentilles', 'عدس', 'Lentils', 'legumes', 'kg'),
  p('pois-chiches', 'Pois chiches', 'حمص', 'Chickpeas', 'legumes', 'kg'),
  p('haricots-blancs', 'Haricots blancs secs', 'لوبيا بيضاء', 'Dried white beans', 'legumes', 'kg'),

  // Spices & condiments
  p('sel', 'Sel', 'ملح', 'Salt', 'spices_condiments', 'kg'),
  p('concentre-tomate', 'Concentré de tomate', 'معجون الطماطم', 'Tomato paste', 'spices_condiments', 'kg'),
  p('harissa', 'Harissa', 'هريسة', 'Harissa', 'spices_condiments', 'kg'),
  p('poivre-noir', 'Poivre noir', 'فلفل أسود', 'Black pepper', 'spices_condiments', 'kg'),
  p('cumin', 'Cumin', 'كمون', 'Cumin', 'spices_condiments', 'kg'),

  // Beverages
  p('cafe-moulu', 'Café moulu', 'قهوة مطحونة', 'Ground coffee', 'beverages', 'kg'),
  p('the', 'Thé', 'شاي', 'Tea', 'beverages', 'kg'),
  p('eau-minerale-1-5l', 'Eau minérale (1,5 L)', 'ماء معدني (1.5 لتر)', 'Mineral water (1.5 L)', 'beverages', 'unit'),
  p('jus-de-fruits', 'Jus de fruits', 'عصير فواكه', 'Fruit juice', 'beverages', 'l'),
  p('boisson-gazeuse', 'Boisson gazeuse', 'مشروب غازي', 'Soft drink', 'beverages', 'l'),

  // Household basics
  p('lessive-poudre', 'Lessive en poudre', 'مسحوق الغسيل', 'Laundry powder', 'household', 'kg'),
  p('liquide-vaisselle', 'Liquide vaisselle', 'سائل الجلي', 'Dish soap', 'household', 'l'),
  p('eau-de-javel', 'Eau de Javel', 'ماء جافيل', 'Bleach', 'household', 'l'),
  p('savon-toilette', 'Savon de toilette', 'صابون الاستحمام', 'Bar soap', 'household', 'unit'),
  p('papier-toilette', 'Papier toilette (rouleau)', 'ورق المرحاض (لفة)', 'Toilet paper (roll)', 'household', 'unit'),

  // Fuel & energy
  p('essence-super', 'Essence super', 'بنزين ممتاز', 'Super gasoline', 'fuel_energy', 'l', true),
  p('essence-sans-plomb', 'Essence sans plomb', 'بنزين بدون رصاص', 'Unleaded gasoline', 'fuel_energy', 'l', true),
  p('gasoil', 'Gasoil', 'مازوت', 'Diesel', 'fuel_energy', 'l', true),
  p('gpl-carburant', 'GPL carburant (Sirghaz)', 'غاز البترول المميع (سيرغاز)', 'LPG fuel', 'fuel_energy', 'l', true),
  p('bouteille-butane-13kg', 'Bouteille de gaz butane 13 kg', 'قارورة غاز البوتان 13 كغ', 'Butane cylinder (13 kg)', 'fuel_energy', 'unit', true),
];

const BY_SLUG = new Map(PRODUCT_CATALOG.map((product) => [product.slug, product]));

export function getCatalogProduct(slug: string): CatalogProduct | undefined {
  return BY_SLUG.get(slug);
}

export function productName(product: CatalogProduct, locale: 'fr' | 'ar' | 'en'): string {
  return locale === 'ar' ? product.nameAr : locale === 'en' ? product.nameEn : product.nameFr;
}
