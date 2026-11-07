import type { RawPriceRecord } from './types';

const REQUIRED_COLUMNS = [
  'title',
  'quantity',
  'price',
  'currency',
  'observed_at',
  'source_reference',
] as const;

function parseCsvLine(line: string, lineNumber: number): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error(`CSV line ${lineNumber}: unterminated quoted field`);
  fields.push(field.trim());
  return fields;
}

/**
 * Parse a human-reviewed official bulletin export.
 *
 * This deliberately performs no network requests and does not activate a source.
 * The source URL and observation date travel with every row for later review.
 */
export function parseManualBulletinCsv(csv: string): RawPriceRecord[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 1) throw new Error('Bulletin CSV must contain a header');

  const headers = parseCsvLine(lines[0], 1).map((header) => header.toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Bulletin CSV contains duplicate columns');
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Bulletin CSV missing required columns: ${missing.join(', ')}`);
  if (lines.length < 2) throw new Error('Bulletin CSV must contain at least one data row');

  const index = (name: string) => headers.indexOf(name);
  return lines.slice(1).map((line, offset) => {
    const lineNumber = offset + 2;
    const values = parseCsvLine(line, lineNumber);
    if (values.length !== headers.length) {
      throw new Error(`CSV line ${lineNumber}: expected ${headers.length} columns, received ${values.length}`);
    }

    const value = (name: string) => {
      const position = index(name);
      return position < 0 ? '' : values[position] ?? '';
    };
    const title = value('title');
    const quantity = value('quantity');
    const priceText = value('price');
    const currency = value('currency').toUpperCase();
    const observedAt = value('observed_at');
    const sourceReference = value('source_reference');

    if (!title || !quantity || !priceText) {
      throw new Error(`CSV line ${lineNumber}: title, quantity and price are required`);
    }
    if (currency !== 'DZD') throw new Error(`CSV line ${lineNumber}: only DZD prices are accepted`);
    if (!Number.isFinite(Date.parse(observedAt))) {
      throw new Error(`CSV line ${lineNumber}: observed_at must be a valid date`);
    }
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(sourceReference);
    } catch {
      throw new Error(`CSV line ${lineNumber}: source_reference must be an HTTPS URL`);
    }
    if (sourceUrl.protocol !== 'https:') {
      throw new Error(`CSV line ${lineNumber}: source_reference must be an HTTPS URL`);
    }

    const wilayaCode = value('wilaya_code');
    if (wilayaCode && !/^\d{2,3}$/.test(wilayaCode)) {
      throw new Error(`CSV line ${lineNumber}: wilaya_code must contain 2 or 3 digits`);
    }

    return {
      title: `${title} ${quantity}`.trim().slice(0, 240),
      priceText,
      currency: 'DZD',
      observedAt: new Date(observedAt).toISOString(),
      ...(wilayaCode ? { wilayaCode } : {}),
      ...(value('commune_code') ? { communeCode: value('commune_code') } : {}),
      sourceReference: sourceUrl.toString(),
    };
  });
}
