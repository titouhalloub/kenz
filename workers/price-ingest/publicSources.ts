import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRODUCT_CATALOG, type BaseUnit } from '../../src/domain/productCatalog';
import { normalizePriceRecord } from './normalize';
import type { NormalizedPriceRecord } from './types';

export interface ScrapedPrice {
  productSlug: string;
  normalized: NormalizedPriceRecord;
  sourceSlug: string;
  sourceReference: string;
}

export interface PublicSourceConfig {
  slug: string;
  kind: 'madrp-pdf' | 'dcw-html';
  url: string;
  wilayaCode?: string;
}

const MADRP_LISTING = 'https://madr.gov.dz/mercuriale-des-prix/';
const TIZI_OUZOU_URL = 'https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article';
const JIJEL_URL = 'https://www.dcwjijel.dz/index.php/moy-prix/prix-journ';
export const PUBLIC_PRICE_SOURCES: PublicSourceConfig[] = [
  { slug: 'madrp-mercuriale', kind: 'madrp-pdf', url: MADRP_LISTING },
  { slug: 'dcw-tizi-ouzou-daily', kind: 'dcw-html', url: TIZI_OUZOU_URL, wilayaCode: '15' },
  { slug: 'dcw-jijel-daily', kind: 'dcw-html', url: JIJEL_URL, wilayaCode: '18' },
];

const products = new Map(PRODUCT_CATALOG.map((product) => [product.slug, product]));
const sourceAliases: Record<string, string> = {
  'semoule superieure': 'semoule-ordinaire',
  'semoule ordinaire': 'semoule-ordinaire',
  'semoule fine': 'semoule-fine',
  'farine superieure': 'farine-ble-tendre',
  'farine ordinaire conditionne subventionne': 'farine-ble-tendre',
  'farine de ble tendre': 'farine-ble-tendre',
  'farine': 'farine-ble-tendre',
  'pates alimentaires': 'pates-spaghetti',
  'huile alimentaire': 'huile-table',
  'huiles alimentaires': 'huile-table',
  'huile de table': 'huile-table',
  'huiles alimentaire': 'huile-table',
  'lait de vache': 'lait-sachet',
  'oeufs': 'oeufs',
  'oeuf': 'oeufs',
  'oeufs unite': 'oeufs',
  'oeuf unite': 'oeufs',
  'lait de vache litre': 'lait-sachet',
  'pomme de terre': 'pomme-de-terre',
  'pommes de terre': 'pomme-de-terre',
  'tomate fraiche': 'tomate',
  'tomate': 'tomate',
  'oignon sec': 'oignon',
  'oignon': 'oignon',
  'carotte': 'carotte',
  'courgette': 'courgette',
  'poivron': 'poivron',
  'piment': 'piment-piquant',
  'haricot vert': 'haricots-verts',
  'haricots verts': 'haricots-verts',
  'salade': 'laitue',
  'laitue': 'laitue',
  'ail sec': 'ail',
  'concombre': 'concombre',
  'chou fleur': 'chou-fleur',
  'navet': 'navet',
  'pomme locale': 'pomme',
  'pommes locales': 'pomme',
  'pomme': 'pomme',
  'orange': 'orange',
  'oranges': 'orange',
  'banane': 'banane',
  'bananes': 'banane',
  'dattes': 'dattes-deglet-nour',
  'viande bovine locale': 'viande-bovine-locale',
  'viande ovine locale': 'viande-ovine',
  'viande ovine': 'viande-ovine',
  'viande blanche poulet': 'poulet-frais',
  'poisson sardine': 'sardines',
  'poulet de chair': 'poulet-frais',
  'poulet': 'poulet-frais',
  'sardines': 'sardines',
  'poisson': 'sardines',
  'lentilles': 'lentilles',
  'pois chiches': 'pois-chiches',
  'haricot sec': 'haricots-blancs',
  'haricots secs': 'haricots-blancs',
  'haricot rouge': 'haricots-blancs',
  'riz': 'riz',
  'couscous ordinaire': 'couscous',
  'couscous': 'couscous',
  'cafe': 'cafe-moulu',
  'the': 'the',
  'sucre blanc': 'sucre',
  'sucre': 'sucre',
  'concentre de tomate': 'concentre-tomate',
  'yaourt aromatise': 'yaourt',
  'yaourt fruite': 'yaourt',
  'fromage fondu': 'fromage-fondu',
  'eau minerale': 'eau-minerale-1-5l',
  'jus': 'jus-de-fruits',
  'boisson gazeuse': 'boisson-gazeuse',
};

function key(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMoney(value: string): string | null {
  const cleaned = value.replace(/[\u00a0\u202f]/g, ' ').trim();
  if (!cleaned || /^(?:\/|—|-)$/.test(cleaned)) return null;
  const compact = cleaned.replace(/(?<=\d)\s+(?=\d{3}(?:\D|$))/g, '');
  return /^\d+(?:[.,]\d{1,2})?$/.test(compact) ? compact.replace(',', '.') : null;
}

function quantityFor(unit: string, baseUnit: BaseUnit): string | null {
  const raw = unit.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(',', '.').trim();
  const value = key(raw);
  if (baseUnit === 'kg') {
    if (!value || value === 'kg' || value === '1 kg') return '1 kg';
    const kgMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)$/);
    if (kgMatch) return `${kgMatch[1]} kg`;
    const gramMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:g|gr|gram|grammes?)$/);
    if (gramMatch) return `${gramMatch[1]} g`;
    return null;
  }
  if (baseUnit === 'l') {
    if (!value || value === 'l' || value === '1 l') return '1 l';
    const litreMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:l|litre|litres)$/);
    if (litreMatch) return `${litreMatch[1]} l`;
    const mlMatch = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/);
    if (mlMatch) return `${mlMatch[1]} ml`;
    return null;
  }
  if (!value || /^(?:unite|unites|piece|pieces|oeuf|oeufs)$/.test(value)) return '1 unit';
  const pack = value.match(/^(\d+)\s*(?:p|pcs?|pieces?|unites?)$/);
  if (pack) return `${pack[1]} units`;
  // A packaged item measured in grams/litres is still one retail unit in this catalog.
  if (/\d+(?:\.\d+)?\s*(?:kg|g|gr|gram|grammes?|l|ml|litre|litres)$/.test(raw)) return '1 unit';
  return null;
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê').replace(/&agrave;/gi, 'à').replace(/&ccedil;/gi, 'ç')
    .replace(/&ocirc;/gi, 'ô').replace(/&ugrave;/gi, 'ù').replace(/&rsquo;|&#0*39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlCellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function dateFromText(value: string): string | null {
  const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

function productSlug(label: string): string | null {
  const normalized = key(label);
  const mapped = sourceAliases[normalized];
  if (mapped) return mapped;
  const exact = PRODUCT_CATALOG.find((product) =>
    key(product.nameFr) === normalized || key(product.nameEn) === normalized || key(product.nameAr) === normalized);
  return exact?.slug || null;
}

function toScraped(
  sourceSlug: string,
  sourceReference: string,
  observedAt: string,
  wilayaCode: string | undefined,
  label: string,
  quantity: string,
  priceText: string,
): ScrapedPrice | null {
  const slug = productSlug(label);
  if (!slug) return null;
  const product = products.get(slug);
  if (!product) return null;
  const normalized = normalizePriceRecord({
    title: `${label} ${quantity}`,
    priceText,
    currency: 'DZD',
    observedAt,
    ...(wilayaCode ? { wilayaCode } : {}),
    sourceReference,
  }, product.baseUnit);
  if (!normalized) return null;
  return { productSlug: slug, normalized, sourceSlug, sourceReference };
}

/** A 404 robots.txt means no published rules; network/5xx failures fail closed. */
export async function robotsAllows(url: URL): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(new URL('/robots.txt', url.origin), {
      headers: { 'User-Agent': 'KenzPriceBot/1.0 (+https://github.com/titouhalloub/kenz)' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return false;
  }
  if (response.status === 404) return true;
  if (!response.ok) return false;
  const lines = (await response.text()).split(/\r?\n/);
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((name === 'allow' || name === 'disallow') && current && value) {
      current.rules.push({ allow: name === 'allow', path: value });
    }
  }
  const specific = groups.filter((group) => group.agents.some((agent) => agent === 'kenzpricebot'));
  const selectedGroups = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
  const selected = selectedGroups.flatMap((group) => group.rules);
  const path = `${url.pathname}${url.search}`;
  const matching = selected.filter((rule) => path.startsWith(rule.path));
  if (!matching.length) return true;
  const longest = matching.sort((a, b) => b.path.length - a.path.length)[0];
  return longest.allow;
}

const lastHostRequestAt = new Map<string, number>();

async function waitForHost(origin: string): Promise<void> {
  const previous = lastHostRequestAt.get(origin) || 0;
  const waitMs = Math.max(0, 1_100 - (Date.now() - previous));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastHostRequestAt.set(origin, Date.now());
}

async function fetchPublic(url: URL, redirects = 0): Promise<Response> {
  if (url.protocol !== 'https:') throw new Error('Only HTTPS source URLs are supported');
  if (!await robotsAllows(url)) throw new Error(`robots.txt disallows or could not be checked: ${url.origin}`);
  await waitForHost(url.origin);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'KenzPriceBot/1.0 (+https://github.com/titouhalloub/kenz)',
      Accept: 'text/html,application/pdf,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= 2) throw new Error('Source exceeded the allowed redirect limit');
    const location = response.headers.get('location');
    if (!location) throw new Error('Source returned a redirect without a location');
    const next = new URL(location, url);
    if (next.protocol !== 'https:' || next.hostname !== url.hostname) {
      throw new Error('Cross-host or non-HTTPS redirects are not followed');
    }
    return fetchPublic(next, redirects + 1);
  }
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response;
}

export function extractPdfLinks(html: string, listingUrl: URL): URL[] {
  const links: URL[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
    try {
      const linked = new URL(decodeEntities(match[1]), listingUrl);
      const embedded = linked.searchParams.get('file');
      const url = embedded ? new URL(embedded, linked) : linked;
      if (url.protocol === 'https:' && url.hostname === listingUrl.hostname &&
          /prix_\d{2}_[a-z]{3}_\d{4}_madrp\.pdf/i.test(url.pathname)) links.push(url);
    } catch { /* ignore malformed external links */ }
  }
  return [...new Map(links.map((url) => [url.href, url])).values()];
}

function dateFromMadrpFilename(url: URL): string | null {
  const match = url.pathname.match(/prix_(\d{2})_([a-z]{3})_(\d{4})_madrp\.pdf/i);
  if (!match) return null;
  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const month = months[match[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString();
}

function pdfToText(bytes: Uint8Array): string {
  const directory = mkdtempSync(join(tmpdir(), 'kenz-price-'));
  const pdfPath = join(directory, 'bulletin.pdf');
  try {
    writeFileSync(pdfPath, bytes);
    return execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function parseMadrpText(text: string, sourceUrl: string, observedAt: string): ScrapedPrice[] {
  const output: ScrapedPrice[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 4) continue;
    let numericIndex = -1;
    for (let i = 1; i <= tokens.length - 3; i += 1) {
      if ([tokens[i], tokens[i + 1], tokens[i + 2]].every((token) => /^\d+(?:[.,]\d+)?$/.test(token))) {
        numericIndex = i;
        break;
      }
    }
    if (numericIndex < 1) continue;
    const label = tokens.slice(0, numericIndex).join(' ').replace(/[|:]+$/g, '').trim();
    const slug = productSlug(label);
    if (!slug) continue;
    const product = products.get(slug);
    if (!product) continue;
    const quantity = product.baseUnit === 'kg' ? '1 kg' : product.baseUnit === 'l' ? '1 l' : '1 unit';
    const row = toScraped('madrp-mercuriale', sourceUrl, observedAt, undefined, label, quantity, tokens[numericIndex]);
    if (row) output.push(row);
  }
  return output;
}

export function parseDcwHtml(html: string, source: PublicSourceConfig): ScrapedPrice[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const pageText = htmlCellText(html);
  const observedAt = dateFromText(pageText);
  if (!observedAt) throw new Error('Could not find a publication date on the Directorate price page');
  const output: ScrapedPrice[] = [];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => htmlCellText(cell[1]));
    if (cells.length < 4) continue;
    const [label, unit, , retail] = cells;
    const price = parseMoney(retail);
    if (!price) continue;
    const slug = productSlug(label);
    if (!slug) continue;
    const product = products.get(slug);
    if (!product) continue;
    const quantity = quantityFor(unit, product.baseUnit);
    if (!quantity) continue;
    const rowPrice = toScraped(source.slug, source.url, observedAt, source.wilayaCode, label, quantity, price);
    if (rowPrice) output.push(rowPrice);
  }
  return output;
}

export function parseDcwPlainHtml(html: string, source: PublicSourceConfig): ScrapedPrice[] {
  const text = decodeEntities(html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' '));
  const observedAt = dateFromText(text);
  if (!observedAt) throw new Error('Could not find a publication date on the Directorate price page');
  const output: ScrapedPrice[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const tokens = rawLine.trim().replace(/\s+/g, ' ').split(' ');
    if (tokens.length < 3) continue;
    const wholesale = parseMoney(tokens[tokens.length - 2]);
    const retail = parseMoney(tokens[tokens.length - 1]);
    if (!wholesale || !retail) continue;

    let matched: ScrapedPrice | null = null;
    // Try every label/unit boundary; source rows vary in spaces and use forms such as 25kg, 1Kg or 500 grs.
    for (let boundary = 1; boundary < tokens.length - 2; boundary += 1) {
      const label = tokens.slice(0, boundary).join(' ');
      const slug = productSlug(label);
      if (!slug) continue;
      const product = products.get(slug);
      if (!product) continue;
      const unit = tokens.slice(boundary, tokens.length - 2).join(' ');
      const quantity = quantityFor(unit, product.baseUnit);
      if (!quantity) continue;
      matched = toScraped(source.slug, source.url, observedAt, source.wilayaCode, label, quantity, retail);
      if (matched) break;
    }

    if (!matched) {
      const label = tokens.slice(0, -2).join(' ');
      const slug = productSlug(label);
      const product = slug ? products.get(slug) : undefined;
      if (product?.baseUnit === 'unit') {
        matched = toScraped(source.slug, source.url, observedAt, source.wilayaCode, label, '1 unit', retail);
      }
    }
    if (matched) output.push(matched);
  }
  return output;
}

export async function scrapePublicSource(source: PublicSourceConfig): Promise<ScrapedPrice[]> {
  const sourceUrl = new URL(source.url);
  const response = await fetchPublic(sourceUrl);
  if (source.kind === 'dcw-html') {
    const html = await response.text();
    const tableRows = parseDcwHtml(html, source);
    return tableRows.length > 0 ? tableRows : parseDcwPlainHtml(html, source);
  }

  const listing = await response.text();
  const pdfs = extractPdfLinks(listing, sourceUrl)
    .map((url) => ({ url, date: dateFromMadrpFilename(url) }))
    .filter((entry): entry is { url: URL; date: string } => Boolean(entry.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = pdfs[0];
  if (!latest) throw new Error('No dated MADRP bulletin PDF link was found');
  const pdfResponse = await fetchPublic(latest.url);
  const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
  const text = pdfToText(bytes);
  return parseMadrpText(text, latest.url.href, latest.date);
}
