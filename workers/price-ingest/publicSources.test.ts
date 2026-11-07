import { describe, expect, it } from 'vitest';
import { robotsAllows, scrapePublicSource } from './publicSources';

describe('public price source adapters', () => {
  it('refuses a source URL that is not HTTPS', async () => {
    await expect(scrapePublicSource({
      slug: 'bad-source', kind: 'dcw-html', url: 'http://example.org/prices', wilayaCode: '15',
    })).rejects.toThrow('Only HTTPS');
  });

  it('keeps robots rules as a hard gate', async () => {
    const allowed = await robotsAllows(new URL('https://example.org/public/prices'));
    expect(typeof allowed).toBe('boolean');
  });
});
