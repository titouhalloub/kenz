export interface RawPriceRecord {
  title: string;
  priceText: string;
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
  baseQuantity: number;
  baseUnit: 'g' | 'ml' | 'unit';
}

export interface PriceSourceAdapter<T = unknown> {
  readonly sourceSlug: string;
  fetch(): Promise<T>;
  parse(payload: T): RawPriceRecord[];
  normalize(records: RawPriceRecord[]): NormalizedPriceRecord[];
}
