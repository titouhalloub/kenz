-- 036: catalog, geographic hierarchy, and audited price-source registry.
-- This migration only creates the data model. No external source is enabled by default.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_fr text not null,
  name_ar text not null,
  name_en text not null,
  category text not null,
  regulated boolean not null default false,
  base_unit text not null check (base_unit in ('kg','l','unit')),
  typical_pack_sizes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(typical_pack_sizes) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_active_idx on public.products(category, slug) where is_active;

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  locale text not null default 'fr' check (locale in ('ar','fr','en')),
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (locale, normalized_alias)
);
create index product_aliases_product_idx on public.product_aliases(product_id);

create table public.communes (
  id uuid primary key default gen_random_uuid(),
  wilaya_code text not null check (wilaya_code ~ '^[0-9]{2,3}$'),
  official_code text,
  name_fr text not null,
  name_ar text not null,
  centroid_lat double precision check (centroid_lat between -90 and 90),
  centroid_lng double precision check (centroid_lng between -180 and 180),
  source_note text,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (wilaya_code, official_code)
);
create index communes_wilaya_idx on public.communes(wilaya_code, name_fr) where is_active;

create table public.price_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in ('official','scraped','merchant','crowd')),
  base_url text,
  license_note text,
  terms_reviewed_at timestamptz,
  robots_reviewed_at timestamptz,
  permission_reference text,
  trust_weight integer not null default 50 check (trust_weight between 0 and 100),
  reviewed boolean not null default false,
  enabled boolean not null default false,
  schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (reviewed and terms_reviewed_at is not null))
);
create index price_sources_enabled_idx on public.price_sources(source_type, slug) where enabled;

-- Initial source registry is intentionally disabled pending human review.
insert into public.price_sources (slug, name, source_type, license_note, trust_weight, reviewed, enabled)
values
  ('agriculture-official-baselines', 'Ministry of Agriculture published price references', 'official',
   'Manual/semi-automated entry only until an official structured feed and reuse terms are confirmed.', 90, false, false),
  ('regulated-price-notices', 'Official Journal and ministry regulated-price notices', 'official',
   'Curated manual entries with effective dates; verify each legal text before publishing.', 100, false, false),
  ('ons-price-index', 'ONS consumer price index', 'official',
   'Trend adjustment only; not a retail basket price feed.', 85, false, false),
  ('merchant-submissions', 'Verified Kenz merchant submissions', 'merchant',
   'Merchant-submitted shelf prices; requires merchant verification and review workflow.', 75, false, false),
  ('community-observations', 'Opt-in Kenz community observations', 'crowd',
   'Explicit opt-in; public contribution; neighborhood aggregates require at least three contributors.', 55, false, false)
on conflict (slug) do nothing;

alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.communes enable row level security;
alter table public.price_sources enable row level security;

revoke all on public.products, public.product_aliases, public.communes, public.price_sources from public, anon, authenticated;
grant select on public.products, public.communes, public.price_sources to anon, authenticated;

create policy "Active products are public" on public.products
for select to anon, authenticated using (is_active);
create policy "Active communes are public" on public.communes
for select to anon, authenticated using (is_active);
create policy "Only reviewed enabled sources are public" on public.price_sources
for select to anon, authenticated using (reviewed and enabled);

revoke truncate, references, trigger on public.products, public.product_aliases, public.communes, public.price_sources from anon, authenticated;

-- Curated starter catalog: product identity only, never fabricated prices.
insert into public.products (slug, name_fr, name_ar, name_en, category, base_unit, typical_pack_sizes)
values
 ('semoule-fine','Semoule fine','سميد رقيق','Fine semolina','grains','kg','["500 g","1 kg","5 kg"]'::jsonb),
 ('semoule-moyenne','Semoule moyenne','سميد متوسط','Medium semolina','grains','kg','["1 kg","5 kg"]'::jsonb),
 ('farine','Farine','فرينة','Flour','grains','kg','["1 kg","5 kg"]'::jsonb),
 ('riz','Riz','أرز','Rice','grains','kg','["500 g","1 kg"]'::jsonb),
 ('pates','Pâtes alimentaires','عجائن غذائية','Pasta','grains','kg','["500 g","1 kg"]'::jsonb),
 ('couscous','Couscous','كسكس','Couscous','grains','kg','["500 g","1 kg"]'::jsonb),
 ('lentilles','Lentilles','عدس','Lentils','legumes','kg','["500 g","1 kg"]'::jsonb),
 ('pois-chiches','Pois chiches','حمص','Chickpeas','legumes','kg','["500 g","1 kg"]'::jsonb),
 ('haricots-secs','Haricots secs','لوبيا يابسة','Dry beans','legumes','kg','["500 g","1 kg"]'::jsonb),
 ('huile-vegetale','Huile végétale','زيت المائدة','Vegetable oil','oils','l','["1 L","2 L","5 L"]'::jsonb),
 ('huile-olive','Huile d’olive','زيت الزيتون','Olive oil','oils','l','["250 ml","500 ml","1 L"]'::jsonb),
 ('sucre','Sucre','سكر','Sugar','pantry','kg','["1 kg","5 kg"]'::jsonb),
 ('sel','Sel','ملح','Salt','pantry','kg','["500 g","1 kg"]'::jsonb),
 ('lait','Lait','حليب','Milk','dairy','l','["1 L"]'::jsonb),
 ('lait-poudre','Lait en poudre','حليب مجفف','Milk powder','dairy','kg','["500 g","1 kg"]'::jsonb),
 ('yaourt','Yaourt nature','ياغورت طبيعي','Plain yogurt','dairy','kg','["100 g","4 x 100 g"]'::jsonb),
 ('oeufs','Œufs','بيض','Eggs','dairy','unit','["6 unités","12 unités","30 unités"]'::jsonb),
 ('beurre','Beurre','زبدة','Butter','dairy','kg','["100 g","250 g","500 g"]'::jsonb),
 ('fromage-frais','Fromage frais','جبن طري','Fresh cheese','dairy','kg','["portion","200 g"]'::jsonb),
 ('pain','Pain','خبز','Bread','bakery','unit','["1 unité"]'::jsonb),
 ('pomme-de-terre','Pomme de terre','بطاطا','Potatoes','vegetables','kg','["1 kg"]'::jsonb),
 ('tomate','Tomate','طماطم','Tomatoes','vegetables','kg','["1 kg"]'::jsonb),
 ('oignon','Oignon','بصل','Onions','vegetables','kg','["1 kg"]'::jsonb),
 ('carotte','Carotte','جزر','Carrots','vegetables','kg','["1 kg"]'::jsonb),
 ('courgette','Courgette','قرعة','Zucchini','vegetables','kg','["1 kg"]'::jsonb),
 ('poivron','Poivron','فلفل','Peppers','vegetables','kg','["1 kg"]'::jsonb),
 ('ail','Ail','ثوم','Garlic','vegetables','kg','["100 g","1 kg"]'::jsonb),
 ('pomme','Pomme','تفاح','Apples','fruit','kg','["1 kg"]'::jsonb),
 ('banane','Banane','موز','Bananas','fruit','kg','["1 kg"]'::jsonb),
 ('orange','Orange','برتقال','Oranges','fruit','kg','["1 kg"]'::jsonb),
 ('dattes','Dattes','تمر','Dates','fruit','kg','["250 g","500 g","1 kg"]'::jsonb),
 ('poulet','Poulet','دجاج','Chicken','meat','kg','["1 kg"]'::jsonb),
 ('viande-boeuf','Viande de bœuf','لحم بقر','Beef','meat','kg','["1 kg"]'::jsonb),
 ('sardines','Sardines','سردين','Sardines','fish','kg','["1 kg"]'::jsonb),
 ('thon-conserve','Thon en conserve','تونة معلبة','Canned tuna','canned','kg','["100 g","160 g"]'::jsonb),
 ('concentre-tomate','Concentré de tomate','طماطم مصبرة','Tomato paste','canned','kg','["70 g","140 g","400 g"]'::jsonb),
 ('cafe','Café','قهوة','Coffee','drinks','kg','["100 g","250 g","500 g"]'::jsonb),
 ('the','Thé','شاي','Tea','drinks','kg','["100 g","250 g"]'::jsonb),
 ('eau','Eau minérale','مياه معدنية','Bottled water','drinks','l','["1.5 L","5 L"]'::jsonb),
 ('gaz-bouteille','Bouteille de gaz','قارورة غاز','LPG cylinder','energy','unit','["13 kg cylinder"]'::jsonb),
 ('essence','Essence','بنزين','Petrol','energy','l','["1 L"]'::jsonb)
on conflict (slug) do update set
 name_fr = excluded.name_fr, name_ar = excluded.name_ar, name_en = excluded.name_en,
 category = excluded.category, base_unit = excluded.base_unit,
 typical_pack_sizes = excluded.typical_pack_sizes, updated_at = now();


-- Canonical identifiers mirrored from src/domain/productCatalog.ts so the app
-- and database share stable slugs and the same kg/l/unit convention.
insert into public.products (slug, name_fr, name_ar, name_en, category, regulated, base_unit, typical_pack_sizes)
values
 ('semoule-ordinaire','Semoule ordinaire','سميد عادي','Standard semolina','cereals_bread',true,'kg','["1 kg","5 kg"]'::jsonb),
 ('semoule-fine','Semoule fine','سميد رفيع','Fine semolina','cereals_bread',true,'kg','["1 kg","5 kg"]'::jsonb),
 ('farine-ble-tendre','Farine de blé tendre','دقيق القمح اللين','Soft wheat flour','cereals_bread',true,'kg','["1 kg","5 kg"]'::jsonb),
 ('baguette','Baguette de pain','خبز باغيت','Baguette','cereals_bread',true,'unit','["1 unité"]'::jsonb),
 ('pates-spaghetti','Pâtes (spaghetti)','معكرونة (سباغيتي)','Pasta (spaghetti)','cereals_bread',false,'kg','["500 g","1 kg"]'::jsonb),
 ('couscous','Couscous','كسكس','Couscous','cereals_bread',false,'kg','["500 g","1 kg"]'::jsonb),
 ('riz','Riz','أرز','Rice','cereals_bread',false,'kg','["500 g","1 kg"]'::jsonb),
 ('huile-table','Huile de table','زيت المائدة','Cooking oil','oils_fats',true,'l','["1 L","2 L","5 L"]'::jsonb),
 ('beurre','Beurre','زبدة','Butter','oils_fats',false,'kg','["100 g","250 g","500 g"]'::jsonb),
 ('sucre','Sucre','سكر','Sugar','sugar_sweeteners',true,'kg','["1 kg","5 kg"]'::jsonb),
 ('miel','Miel','عسل','Honey','sugar_sweeteners',false,'kg','["250 g","500 g","1 kg"]'::jsonb),
 ('lait-sachet','Lait pasteurisé (sachet)','حليب مبستر (كيس)','Pasteurised milk (sachet)','dairy_eggs',true,'l','["1 L"]'::jsonb),
 ('lait-poudre','Lait en poudre','حليب مجفف','Powdered milk','dairy_eggs',false,'kg','["500 g","1 kg"]'::jsonb),
 ('yaourt','Yaourt','زبادي','Yogurt','dairy_eggs',false,'unit','["1 pot","4 pots"]'::jsonb),
 ('fromage-fondu','Fromage fondu','جبن مطبوخ','Processed cheese','dairy_eggs',false,'kg','["100 g","200 g"]'::jsonb),
 ('oeufs','Œufs','بيض','Eggs','dairy_eggs',false,'unit','["6 unités","12 unités","30 unités"]'::jsonb),
 ('pomme-de-terre','Pomme de terre','بطاطا','Potato','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('tomate','Tomate','طماطم','Tomato','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('oignon','Oignon','بصل','Onion','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('carotte','Carotte','جزر','Carrot','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('courgette','Courgette','كوسة','Zucchini','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('poivron','Poivron','فلفل حلو','Bell pepper','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('piment-piquant','Piment piquant','فلفل حار','Hot pepper','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('aubergine','Aubergine','باذنجان','Eggplant','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('chou-fleur','Chou-fleur','قرنبيط','Cauliflower','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('navet','Navet','لفت','Turnip','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('laitue','Laitue','خس','Lettuce','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('ail','Ail','ثوم','Garlic','vegetables',false,'kg','["100 g","1 kg"]'::jsonb),
 ('concombre','Concombre','خيار','Cucumber','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('haricots-verts','Haricots verts','فاصوليا خضراء','Green beans','vegetables',false,'kg','["1 kg"]'::jsonb),
 ('orange','Orange','برتقال','Orange','fruits',false,'kg','["1 kg"]'::jsonb),
 ('pomme','Pomme','تفاح','Apple','fruits',false,'kg','["1 kg"]'::jsonb),
 ('banane','Banane','موز','Banana','fruits',false,'kg','["1 kg"]'::jsonb),
 ('clementine','Clémentine','كلمنتين','Clementine','fruits',false,'kg','["1 kg"]'::jsonb),
 ('dattes-deglet-nour','Dattes (Deglet Nour)','تمر (دقلة نور)','Dates (Deglet Nour)','fruits',false,'kg','["250 g","500 g","1 kg"]'::jsonb),
 ('poire','Poire','كمثرى','Pear','fruits',false,'kg','["1 kg"]'::jsonb),
 ('pasteque','Pastèque','بطيخ أحمر','Watermelon','fruits',false,'kg','["1 kg"]'::jsonb),
 ('citron','Citron','ليمون','Lemon','fruits',false,'kg','["1 kg"]'::jsonb),
 ('poulet-frais','Poulet frais','دجاج طازج','Fresh chicken','meat_fish',false,'kg','["1 kg"]'::jsonb),
 ('viande-bovine-locale','Viande bovine locale','لحم بقري محلي','Local beef','meat_fish',false,'kg','["1 kg"]'::jsonb),
 ('viande-ovine','Viande ovine (mouton)','لحم الغنم','Mutton / lamb','meat_fish',false,'kg','["1 kg"]'::jsonb),
 ('dinde','Dinde','ديك رومي','Turkey','meat_fish',false,'kg','["1 kg"]'::jsonb),
 ('sardines','Sardines','سردين','Sardines','meat_fish',false,'kg','["1 kg"]'::jsonb),
 ('thon-conserve','Thon en conserve','تونة معلبة','Canned tuna','meat_fish',false,'unit','["100 g","160 g"]'::jsonb),
 ('lentilles','Lentilles','عدس','Lentils','legumes',false,'kg','["500 g","1 kg"]'::jsonb),
 ('pois-chiches','Pois chiches','حمص','Chickpeas','legumes',false,'kg','["500 g","1 kg"]'::jsonb),
 ('haricots-blancs','Haricots blancs secs','لوبيا بيضاء','Dried white beans','legumes',false,'kg','["500 g","1 kg"]'::jsonb),
 ('sel','Sel','ملح','Salt','spices_condiments',false,'kg','["500 g","1 kg"]'::jsonb),
 ('concentre-tomate','Concentré de tomate','معجون الطماطم','Tomato paste','spices_condiments',false,'kg','["70 g","140 g","400 g"]'::jsonb),
 ('harissa','Harissa','هريسة','Harissa','spices_condiments',false,'kg','["100 g","200 g"]'::jsonb),
 ('poivre-noir','Poivre noir','فلفل أسود','Black pepper','spices_condiments',false,'kg','["50 g","100 g"]'::jsonb),
 ('cumin','Cumin','كمون','Cumin','spices_condiments',false,'kg','["50 g","100 g"]'::jsonb),
 ('cafe-moulu','Café moulu','قهوة مطحونة','Ground coffee','beverages',false,'kg','["100 g","250 g","500 g"]'::jsonb),
 ('the','Thé','شاي','Tea','beverages',false,'kg','["100 g","250 g"]'::jsonb),
 ('eau-minerale-1-5l','Eau minérale (1,5 L)','ماء معدني (1.5 لتر)','Mineral water (1.5 L)','beverages',false,'unit','["1 bouteille"]'::jsonb),
 ('jus-de-fruits','Jus de fruits','عصير فواكه','Fruit juice','beverages',false,'l','["1 L"]'::jsonb),
 ('boisson-gazeuse','Boisson gazeuse','مشروب غازي','Soft drink','beverages',false,'l','["1 L","2 L"]'::jsonb),
 ('lessive-poudre','Lessive en poudre','مسحوق الغسيل','Laundry powder','household',false,'kg','["500 g","1 kg","3 kg"]'::jsonb),
 ('liquide-vaisselle','Liquide vaisselle','سائل الجلي','Dish soap','household',false,'l','["500 ml","1 L"]'::jsonb),
 ('eau-de-javel','Eau de Javel','ماء جافيل','Bleach','household',false,'l','["1 L","2 L"]'::jsonb),
 ('savon-toilette','Savon de toilette','صابون الاستحمام','Bar soap','household',false,'unit','["1 savon"]'::jsonb),
 ('papier-toilette','Papier toilette (rouleau)','ورق المرحاض (لفة)','Toilet paper (roll)','household',false,'unit','["1 rouleau"]'::jsonb),
 ('essence-super','Essence super','بنزين ممتاز','Super gasoline','fuel_energy',true,'l','["1 L"]'::jsonb),
 ('essence-sans-plomb','Essence sans plomb','بنزين بدون رصاص','Unleaded gasoline','fuel_energy',true,'l','["1 L"]'::jsonb),
 ('gasoil','Gasoil','مازوت','Diesel','fuel_energy',true,'l','["1 L"]'::jsonb),
 ('gpl-carburant','GPL carburant (Sirghaz)','غاز البترول المميع (سيرغاز)','LPG fuel','fuel_energy',true,'l','["1 L"]'::jsonb),
 ('bouteille-butane-13kg','Bouteille de gaz butane 13 kg','قارورة غاز البوتان 13 كغ','Butane cylinder (13 kg)','fuel_energy',true,'unit','["13 kg cylinder"]'::jsonb)
on conflict (slug) do update set
 name_fr = excluded.name_fr, name_ar = excluded.name_ar, name_en = excluded.name_en,
 category = excluded.category, regulated = excluded.regulated,
 base_unit = excluded.base_unit, typical_pack_sizes = excluded.typical_pack_sizes,
 updated_at = now();

-- Seed exact multilingual names as deterministic aliases; fuzzy matching stays review-only.
insert into public.product_aliases (product_id, alias, locale, normalized_alias)
select p.id, aliases.alias, aliases.locale,
       lower(regexp_replace(btrim(aliases.alias), '\\s+', ' ', 'g'))
from public.products p
cross join lateral (values
  ('fr'::text, p.name_fr), ('ar'::text, p.name_ar), ('en'::text, p.name_en)
) as aliases(locale, alias)
where p.is_active and btrim(aliases.alias) <> ''
on conflict (locale, normalized_alias) do nothing;

-- Commune rows are intentionally not seeded until the current official commune
-- code/name dataset has been checked against the latest administrative register.
