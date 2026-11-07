import type { BaseUnit } from '../../src/domain/productCatalog';

export interface RawPriceRecord {
  title: string;
  priceText: string;
  currency: string;
  observedAt: string;
  wilayaCode?: string;
  communeCode?: string;
  sourceReference?: string;
}

export interface NormalizedPriceRecord {
  title: string;
  unitPriceMinor: number;
  currency: 'DZD';
  observedAt: string;
  wilayaCode?: string;
  communeCode?: string;
  sourceReference?: string;
  quantityMilliUnits: number;
  baseUnit: BaseUnit;
}

export interface PriceSourceAdapter<T = unknown> {
  readonly sourceSlug: string;
  fetch(): Promise<T>;
  parse(payload: T): RawPriceRecord[];
  normalize(records: RawPriceRecord[]): NormalizedPriceRecord[];
}
