import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfLinks, parseDcwHtml, parseMadrpText, robotsAllows, scrapePublicSource } from './publicSources';

afterEach(() => vi.unstubAllGlobals());

describe('public price source adapters', () => {
  it('refuses a source URL that is not HTTPS', async () => {
    await expect(scrapePublicSource({
      slug: 'bad-source', kind: 'dcw-html', url: 'http://example.org/prices', wilayaCode: '15',
    })).rejects.toThrow('Only HTTPS');
  });

  it('obeys robots disallow rules for the matching user-agent group', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      'User-agent: *\nDisallow: /private\nAllow: /private/public\n',
      { status: 200 },
    ))));
    await expect(robotsAllows(new URL('https://example.org/private/prices'))).resolves.toBe(false);
    await expect(robotsAllows(new URL('https://example.org/private/public/prices'))).resolves.toBe(true);
  });

  it('uses the Kenz-specific robots group when one is published', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      'User-agent: *\nDisallow: /\n\nUser-agent: KenzPriceBot\nAllow: /prices\n',
      { status: 200 },
    ))));
    await expect(robotsAllows(new URL('https://example.org/prices/today'))).resolves.toBe(true);
    await expect(robotsAllows(new URL('https://example.org/private'))).resolves.toBe(true);
  });


  it('extracts same-host PDF URLs embedded inside the official viewer page', () => {
    const html = '<a href="/wp-content/plugins/embedpress/assets/pdf/viewer.html?file=https%3A%2F%2Fmadr.gov.dz%2Fwp-content%2Fuploads%2F2026%2F11%2Fprix_04_Nov_2026_MADRP.pdf">Bulletin</a>';
    const links = extractPdfLinks(html, new URL('https://madr.gov.dz/mercuriale-des-prix/'));
    expect(links).toHaveLength(1);
    expect(links[0].pathname).toContain('prix_04_Nov_2026_MADRP.pdf');
  });

  it('parses a Directorate HTML table and normalizes pack quantities', () => {
    const html = `
      <html><body><p>Prix journaliers 07/11/2026</p><table>
      <tr><th>Produit</th><th>Unité</th><th>Gros</th><th>Détail</th><th>Min</th><th>Max</th></tr>
      <tr><td>Pomme de Terre</td><td>Kg</td><td>75</td><td>87,5</td><td>85</td><td>90</td></tr>
      <tr><td>Oeufs</td><td>Unité</td><td>14,5</td><td>16,5</td><td>15</td><td>18</td></tr>
      <tr><td>Tomate fraîche</td><td>Kg</td><td>/</td><td>/</td><td>/</td><td>/</td></tr>
      </table></body></html>`;
    const rows = parseDcwHtml(html, {
      slug: 'dcw-tizi-ouzou-daily',
      kind: 'dcw-html',
      url: 'https://example.org/prices',
      wilayaCode: '15',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].productSlug).toBe('pomme-de-terre');
    expect(rows[0].normalized.unitPriceMinor).toBe(8750);
    expect(rows[0].normalized.wilayaCode).toBe('15');
    expect(rows[1].productSlug).toBe('oeufs');
    expect(rows[1].normalized.unitPriceMinor).toBe(1650);
  });

  it('parses official MADRP bulletin text as national average observations', () => {
    const text = [
      'Pomme de terre 95 101 89 البطاطا',
      'Tomate 138 153 123 الطماطم',
      'Œufs (Unité) 22 23 21 البيض',
      'Lait de vache (Litre) 94 100 88 الحليب',
      'Légumes frais',
    ].join('\n');
    const rows = parseMadrpText(text, 'https://madr.gov.dz/prix_04_Nov_2026_MADRP.pdf', '2026-11-04T00:00:00.000Z');
    expect(rows.map((row) => row.productSlug)).toEqual(['pomme-de-terre', 'tomate', 'oeufs', 'lait-sachet']);
    expect(rows[0].normalized.unitPriceMinor).toBe(9500);
    expect(rows[2].normalized.unitPriceMinor).toBe(2200);
    expect(rows.every((row) => !row.normalized.wilayaCode)).toBe(true);
  });
});
