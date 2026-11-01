export interface TruthRow {
  date: string;
  description: string;
  /** signed, inflow positive (same convention as the app) */
  amountMinor: number;
  balanceMinor: number | null;
}
export interface Truth {
  layout: string;
  seed: number;
  accountType: 'bank' | 'creditCard';
  accountLast4: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  rows: TruthRow[];
  /** false when the statement prints no period line (period then cannot be expected) */
  printsPeriod?: boolean;
  password?: string;
  /** set for files that must be rejected */
  expectedError?: 'no-text-layer';
  pageCount: number;
}
export interface Synthetic {
  pdf: Uint8Array;
  truth: Truth;
}
