/**
 * Versioned, serialisable domain model (zod). Money = integer minor units.
 * Sign convention for Row.amountMinor: money INTO the account is positive, money OUT is
 * negative, for bank AND credit-card accounts (this matches OFX TRNAMT).
 * Balances (opening/closing/running) are stored exactly as printed on the statement:
 * bank = funds held (overdrawn < 0); credit card = amount OWED (credit balance < 0).
 */
import { z } from 'zod';

// zod's JIT compiler uses `new Function`, which a strict CSP (no 'unsafe-eval') forbids. Interpret schemas instead.
z.config({ jitless: true });

export const SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minor = z.number().int().refine(Number.isSafeInteger);

export const BBoxSchema = z.object({
  /** 1-based page number. */
  page: z.number().int().min(1),
  /** PDF points, origin top-left of the page. */
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type BBox = z.infer<typeof BBoxSchema>;

export const CellRefsSchema = z.object({
  date: BBoxSchema.optional(),
  postDate: BBoxSchema.optional(),
  description: z.array(BBoxSchema).optional(),
  amount: BBoxSchema.optional(),
  balance: BBoxSchema.optional(),
});
export type CellRefs = z.infer<typeof CellRefsSchema>;

export const RowFlagSchema = z.enum(['manual', 'edited', 'split', 'merged', 'date-inherited', 'low-confidence']);
export type RowFlag = z.infer<typeof RowFlagSchema>;

export const RowSchema = z.object({
  id: z.uuid(),
  date: isoDate,
  postDate: isoDate.optional(),
  description: z.string(),
  /** Description exactly as extracted; keeps FITIDs stable when the user cleans up descriptions. */
  sourceDescription: z.string(),
  amountMinor: minor,
  balanceMinor: minor.nullable().optional(),
  payee: z.string().optional(),
  category: z.string().optional(),
  memo: z.string().optional(),
  source: CellRefsSchema.optional(),
  flags: z.array(RowFlagSchema).optional(),
});
export type Row = z.infer<typeof RowSchema>;

export const ColumnRoleSchema = z.enum(['date', 'postDate', 'description', 'debit', 'credit', 'amount', 'balance', 'ref', 'ignore']);
export type ColumnRole = z.infer<typeof ColumnRoleSchema>;

export const ColumnDefSchema = z.object({
  role: ColumnRoleSchema,
  /** Zone boundaries in PDF points (x). Cells are assigned by the centre of their text. */
  x0: z.number(),
  x1: z.number(),
});
export type ColumnDef = z.infer<typeof ColumnDefSchema>;

export const TableRegionSchema = z.object({
  page: z.number().int().min(1),
  /** y of the header line (top-origin points). */
  headerY: z.number(),
  columns: z.array(ColumnDefSchema),
});
export type TableRegion = z.infer<typeof TableRegionSchema>;

export const AccountTypeSchema = z.enum(['bank', 'creditCard']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const BalanceSourceSchema = z.enum(['label', 'label-search', 'running-balance', 'manual', 'none']);
export type BalanceSource = z.infer<typeof BalanceSourceSchema>;

export const StatementSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  fileSha256: z.string(),
  pageCount: z.number().int().min(0),
  accountType: AccountTypeSchema,
  accountLast4: z.string().optional(),
  currency: z.string().length(3),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  openingBalanceMinor: minor.nullable(),
  closingBalanceMinor: minor.nullable(),
  balanceSource: BalanceSourceSchema,
  rows: z.array(RowSchema),
  tables: z.array(TableRegionSchema).default([]),
  warnings: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  /** Pages of the source PDF that contributed rows (1-based). Used by the report and the PDF pane. */
  pagesWithRows: z.array(z.number().int().min(1)).default([]),
  createdAt: z.string(),
});
export type Statement = z.infer<typeof StatementSchema>;

export const RuleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  enabled: z.boolean().default(true),
  match: z.object({
    type: z.enum(['contains', 'regex', 'fuzzy']),
    pattern: z.string(),
    /** fuzzy similarity threshold 0..1 */
    threshold: z.number().min(0).max(1).optional(),
  }),
  appliesTo: z.enum(['all', 'in', 'out']).default('all'),
  setPayee: z.string().optional(),
  setCategory: z.string().optional(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const ExportSettingsSchema = z.object({
  dateFormat: z.enum(['iso', 'mdy', 'dmy', 'dd-mon-yyyy']).default('iso'),
  amountStyle: z.enum(['signed', 'debitCredit']).default('signed'),
  delimiter: z.enum([',', ';', '\t']).default(','),
  decimal: z.enum(['.', ',']).default('.'),
  bom: z.boolean().default(true),
  columns: z.array(z.enum(['date', 'postDate', 'description', 'payee', 'category', 'amount', 'balance', 'account', 'page', 'fitid'])).default(['date', 'description', 'amount', 'balance']),
  intuBid: z.string().default('3000'),
  fiOrg: z.string().default('LedgerLocal'),
  fiFid: z.string().default('3000'),
  bankRoutingId: z.string().default('000000000'),
  accountTypeOfx: z.enum(['CHECKING', 'SAVINGS']).default('CHECKING'),
});
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.uuid(),
  /** A project doubles as the client profile: statements + rules + export defaults for one client. */
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  statements: z.array(StatementSchema),
  rules: z.array(RuleSchema).default([]),
  exportSettings: ExportSettingsSchema.default(() => ExportSettingsSchema.parse({})),
  /** True only if the user opted in to keeping PDF bytes with this project (stored separately by the repository). */
  pdfsStored: z.boolean().default(false),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PROJECT_FILE_KIND = 'ledgerlocal-project';
export const ProjectFileSchema = z.object({
  kind: z.literal(PROJECT_FILE_KIND),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  project: z.unknown(),
});

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
