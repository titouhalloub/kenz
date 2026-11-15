/**
 * Single validation + normalisation step for every price input channel
 * (official scrapers, admin CSV / single entry, community contributions).
 *
 * Output is always a *pending* candidate: this module never accepts or publishes anything.
 * Hard problems are `errors` (row is not staged); soft problems are `flags` (row is staged
 * for a moderator, with the flags stored in price_observations.quality_flags).
 */
import { getCatalogProduct, type BaseUnit } from './productCatalog';
import { ALGERIA_WILAYAS } from './wilayas';
import { DEFAULT_PRICE_WINDOWS, type PriceWindows } from './priceWindow';

export type PriceInputChannel = 'official' | 'admin_import' | 'community';

export interface PriceInputRow {
  productSlug: string;
  /** Price per catalog base unit (kg / l / unit), in minor units (centimes of DZD). */
  unitPriceMinor: number;
  observedAt: string;
  wilayaCode?: string | null;
  sourceReference?: string | null;
  note?: string | null;
}

export interface ValidationContext {
  now: Date;
  windows?: PriceWindows;
  /** Published median per product slug (national or wilaya), used only to flag outliers. */
  referenceMedianBySlug?: Record<string, number>;
  /** Mutable set used to detect duplicates inside one batch. */
  seenKeys?: Set<string>;
}

export interface ValidatedPrice extends PriceInputRow {
  wilayaCode: string | null;
  observedAt: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  flags: string[];
  row?: ValidatedPrice;
}

const WILAYA_CODES = new Set(ALGERIA_WILAYAS.map((entry) => entry.slice(0, entry.indexOf(' ')).replace(/\D/g, '')));
const MAX_UNIT_PRICE_MINOR = 500_000_000;
/** Same band the database uses for community submissions: far outside the published median is suspicious. */
const REFERENCE_RATIO = 4;

/** "6", "06", " 16 " → "06" / "16". Returns null for anything that is not a known wilaya code. */
export function normalizeWilayaCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.trim();
  if (!/^\d{1,3}$/.test(digits)) return null;
  const padded = digits.length === 1 ? `0${digits}` : digits;
  return WILAYA_CODES.has(padded) ? padded : null;
}

/**
 * Converts a price quoted per `unitLabel` into a price per catalog base unit.
 * g→kg and ml→l scale by 1000. A dimension mismatch (e.g. "l" for a kg product) returns null:
 * units are never treated as interchangeable without a valid conversion.
 */
export function toBaseUnitPrice(unitPriceMinor: number, unitLabel: string, baseUnit: BaseUnit): number | null {
  const unit = unitLabel.trim().toLowerCase();
  let factor: number | null = null;
  if (baseUnit === 'kg') factor = unit === 'kg' ? 1 : unit === 'g' ? 1000 : null;
  else if (baseUnit === 'l') factor = unit === 'l' ? 1 : unit === 'ml' ? 1000 : null;
  else factor = ['unit', 'unité', 'unite', 'piece', 'pièce', 'u'].includes(unit) ? 1 : null;
  if (factor === null) return null;
  const converted = Math.round(unitPriceMinor * factor);
  return Number.isSafeInteger(converted) && converted > 0 ? converted : null;
}

const dayKey = (iso: string) => iso.slice(0, 10);

export function validatePriceInput(input: PriceInputRow, context: ValidationContext): ValidationResult {
  const errors: string[] = [];
  const flags: string[] = [];
  const windows = context.windows ?? DEFAULT_PRICE_WINDOWS;

  const product = getCatalogProduct(input.productSlug);
  if (!product) errors.push('unknown_product');

  if (!Number.isSafeInteger(input.unitPriceMinor) || input.unitPriceMinor <= 0 || input.unitPriceMinor > MAX_UNIT_PRICE_MINOR) {
    errors.push('invalid_price');
  } else if (input.unitPriceMinor < 100) {
    flags.push('implausibly_low_price');
  }

  const observed = new Date(input.observedAt);
  let observedIso = '';
  if (!Number.isFinite(observed.getTime())) {
    errors.push('invalid_date');
  } else {
    observedIso = observed.toISOString();
    const ageDays = (context.now.getTime() - observed.getTime()) / 86_400_000;
    if (ageDays < -1) errors.push('future_date');
    else if (ageDays > windows.extendedDays) flags.push('older_than_extended_window');
    else if (ageDays > windows.freshDays) flags.push('older_than_fresh_window');
  }

  let wilayaCode: string | null = null;
  if (input.wilayaCode !== undefined && input.wilayaCode !== null && input.wilayaCode !== '') {
    wilayaCode = normalizeWilayaCode(input.wilayaCode);
    if (!wilayaCode) errors.push('unknown_wilaya');
  }

  const reference = input.sourceReference?.trim();
  if (reference) {
    try {
      if (new URL(reference).protocol !== 'https:') errors.push('source_reference_not_https');
    } catch {
      // Free-text references (e.g. "Bulletin MADR 12/11") are allowed; only URLs must be https.
    }
  }

  if (product && errors.length === 0) {
    const median = context.referenceMedianBySlug?.[input.productSlug];
    if (median && (input.unitPriceMinor > median * REFERENCE_RATIO || input.unitPriceMinor < median / REFERENCE_RATIO)) {
      flags.push('outside_reference_range');
    }
    if (context.seenKeys) {
      const key = [input.productSlug, dayKey(observedIso), wilayaCode ?? 'DZ', input.unitPriceMinor].join('|');
      if (context.seenKeys.has(key)) flags.push('duplicate_in_batch');
      context.seenKeys.add(key);
    }
  }

  if (errors.length > 0) return { ok: false, errors, flags };
  return {
    ok: true, errors, flags,
    row: { ...input, wilayaCode, observedAt: observedIso },
  };
}

// --- CSV (admin import) -------------------------------------------------------------------

export interface CsvImportResult {
  rows: PriceInputRow[];
  errors: Array<{ line: number; message: string }>;
}

export const MAX_CSV_ROWS = 1000;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(field.trim()); field = ''; } else field += char;
  }
  fields.push(field.trim());
  return fields;
}

/**
 * Admin CSV: columns product_slug, unit_price, observed_at (required); unit, wilaya_code,
 * source_reference, note (optional). `unit_price` is in DZD per `unit` (defaults to the product's
 * base unit). Rows with unknown products, bad numbers or unit/dimension mismatches are reported
 * per line and never imported. No network access, no database access.
 */
export function parsePriceCsv(csv: string): CsvImportResult {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const result: CsvImportResult = { rows: [], errors: [] };
  if (lines.length < 2) { result.errors.push({ line: 1, message: 'CSV needs a header and at least one row' }); return result; }
  if (lines.length - 1 > MAX_CSV_ROWS) { result.errors.push({ line: 1, message: `At most ${MAX_CSV_ROWS} rows per import` }); return result; }
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const missing = ['product_slug', 'unit_price', 'observed_at'].filter((column) => !headers.includes(column));
  if (missing.length || new Set(headers).size !== headers.length) {
    result.errors.push({ line: 1, message: missing.length ? `Missing columns: ${missing.join(', ')}` : 'Duplicate columns' });
    return result;
  }
  lines.slice(1).forEach((line, offset) => {
    const lineNumber = offset + 2;
    const values = parseCsvLine(line);
    if (values.length !== headers.length) { result.errors.push({ line: lineNumber, message: `Expected ${headers.length} columns, got ${values.length}` }); return; }
    const get = (name: string) => values[headers.indexOf(name)] ?? '';
    const product = getCatalogProduct(get('product_slug'));
    if (!product) { result.errors.push({ line: lineNumber, message: 'unknown_product' }); return; }
    const amount = Number(get('unit_price').replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { result.errors.push({ line: lineNumber, message: 'invalid_price' }); return; }
    const quotedMinor = Math.round(amount * 100);
    const unitLabel = get('unit') || product.baseUnit;
    const perBase = toBaseUnitPrice(quotedMinor, unitLabel, product.baseUnit);
    if (perBase === null) { result.errors.push({ line: lineNumber, message: `unit_mismatch (${unitLabel} vs ${product.baseUnit})` }); return; }
    result.rows.push({
      productSlug: product.slug, unitPriceMinor: perBase, observedAt: get('observed_at'),
      wilayaCode: get('wilaya_code') || null, sourceReference: get('source_reference') || null, note: get('note') || null,
    });
  });
  return result;
}
