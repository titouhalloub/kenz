import { describe, expect, it } from 'vitest';
import { normalizePriceRecord } from './normalize';
import { parseManualBulletinCsv } from './manualImport';

const source = 'https://example.org/test-bulletin.pdf';

describe('parseManualBulletinCsv', () => {
  it('parses quoted product labels and preserves source provenance', () => {
    const csv = [
      'title,quantity,price,currency,observed_at,wilaya_code,commune_code,source_reference',
      `"Pomme de terre, locale",1 kg,75,DZD,2026-11-06,16,1601,${source}`,
    ].join('\n');

    const [record] = parseManualBulletinCsv(csv);
    expect(record.title).toBe('Pomme de terre, locale 1 kg');
    expect(record.wilayaCode).toBe('16');
    expect(record.communeCode).toBe('1601');
    expect(record.sourceReference).toBe(source);

    const normalized = normalizePriceRecord(record, 'kg');
    expect(normalized?.unitPriceMinor).toBe(7500);
    expect(normalized?.currency).toBe('DZD');
  });

  it('rejects non-DZD values instead of silently converting currencies', () => {
    const csv = [
      'title,quantity,price,currency,observed_at,source_reference',
      `Tomate,1 kg,1,EUR,2026-11-06,${source}`,
    ].join('\n');
    expect(() => parseManualBulletinCsv(csv)).toThrow('only DZD prices are accepted');
  });

  it('rejects non-HTTPS or missing provenance', () => {
    const insecure = [
      'title,quantity,price,currency,observed_at,source_reference',
      'Tomate,1 kg,100,DZD,2026-11-06,http://example.org/bulletin.pdf',
    ].join('\n');
    expect(() => parseManualBulletinCsv(insecure)).toThrow('must be an HTTPS URL');

    const missing = 'title,quantity,price,currency,observed_at';
    expect(() => parseManualBulletinCsv(missing)).toThrow('missing required columns');
  });

  it('rejects malformed rows and invalid wilaya codes', () => {
    const csv = [
      'title,quantity,price,currency,observed_at,wilaya_code,source_reference',
      `Tomate,1 kg,100,DZD,2026-11-06,ABC,${source}`,
    ].join('\n');
    expect(() => parseManualBulletinCsv(csv)).toThrow('wilaya_code must contain 2 or 3 digits');
  });
});
