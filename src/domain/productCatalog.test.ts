import { describe, expect, it } from 'vitest';
import { PRODUCT_CATALOG, getCatalogProduct, productName } from './productCatalog';

describe('PRODUCT_CATALOG', () => {
  it('has unique kebab-case slugs', () => {
    const slugs = PRODUCT_CATALOG.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has non-empty names in all three languages, Arabic in Arabic script', () => {
    for (const product of PRODUCT_CATALOG) {
      expect(product.nameFr.trim(), product.slug).not.toBe('');
      expect(product.nameEn.trim(), product.slug).not.toBe('');
      expect(product.nameAr, product.slug).toMatch(/[؀-ۿ]/);
    }
  });

  it('covers every category with at least one product', () => {
    const categories = new Set(PRODUCT_CATALOG.map((product) => product.category));
    expect(categories.size).toBe(12);
  });

  it('only fuel, staples and butane are marked regulated, and fuel is priced per litre or cylinder', () => {
    const regulated = PRODUCT_CATALOG.filter((product) => product.regulated);
    expect(regulated.length).toBeGreaterThan(0);
    for (const product of regulated) {
      expect(['cereals_bread', 'oils_fats', 'sugar_sweeteners', 'dairy_eggs', 'fuel_energy']).toContain(product.category);
    }
    expect(getCatalogProduct('gasoil')?.baseUnit).toBe('l');
    expect(getCatalogProduct('bouteille-butane-13kg')?.baseUnit).toBe('unit');
  });

  it('looks products up by slug and picks the locale name', () => {
    const sugar = getCatalogProduct('sucre');
    expect(sugar).toBeDefined();
    expect(productName(sugar!, 'fr')).toBe('Sucre');
    expect(productName(sugar!, 'en')).toBe('Sugar');
    expect(productName(sugar!, 'ar')).toBe('سكر');
    expect(getCatalogProduct('does-not-exist')).toBeUndefined();
  });
});
