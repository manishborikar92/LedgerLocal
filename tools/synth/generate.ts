/**
 * Synthetic statement generator: >= 10 distinct layouts with ground truth.
 * Every bank name is fictional. Output is fully determined by (layout id, seed).
 */
import PDFDocument from 'pdfkit';
import zlib from 'node:zlib';
import { addDays, isoToDays, toIso } from '../../src/core/dates';
import { formatMinor } from '../../src/core/money';
import { Rng } from './rng';
import type { Synthetic, Truth, TruthRow } from './types';

type DateStyle = 'mdy4' | 'mdy2' | 'md' | 'mon-d' | 'dmy-dots' | 'dmy-dash' | 'd-mon-y';
type MoneyStyle = 'us' | 'eu' | 'in';
type AmountMode = 'signed' | 'parens' | 'debit-credit' | 'trailing-minus' | 'cc-signed' | 'cc-crdr' | 'cc-neg';
type Key = 'date' | 'post' | 'desc' | 'debit' | 'credit' | 'amount' | 'balance' | 'extra';
interface ColSpec { key: Key; x: number; w: number; align: 'left' | 'right'; title: string; hAlign?: 'left' | 'right' | 'center' }

interface Spec {
  id: string;
  bank: string;
  acct: 'bank' | 'creditCard';
  font: string;
  bold: string;
  size: number;
  rowH: number;
  dateStyle: DateStyle;
  money: MoneyStyle;
  currency: string;
  symbol: string;
  amountMode: AmountMode;
  showBalance: boolean;
  balanceStyle?: 'signed' | 'parens' | 'crdr';
  cols: ColSpec[];
  headerStyle: 'fill' | 'rule' | 'plain';
  period: 'mdy4' | 'long' | 'dots' | 'dash' | 'rollover';
  summary: 'lines' | 'box' | 'decoy';
  rows: [number, number];
  multiline?: boolean;
  fragments?: boolean;
  totalsRow?: boolean;
  sections?: boolean;
  repeatHeader: boolean;
  password?: string;
  openLabel: string;
  closeLabel: string;
  negativeBalances?: boolean;
  headerFill?: string;
  groupedDates?: boolean;
  leftAlignNumbers?: boolean;
  symbolOnAmounts?: boolean;
  extra?: 'category' | 'check';
  bfRow?: boolean;
  noSummary?: boolean;
}

const MERCH = ['Northwind Grocers', 'Pinecrest Coffee Co', 'Harbor Fuel', 'Willow Street Pharmacy', 'Bluebird Airlines', 'Cedar and Oak Hardware', 'Lumen Power and Light', 'Maple Leaf Internet', 'Summit Fitness Club', 'Riverbend Books', 'Atlas Auto Repair', 'Juniper Thai Kitchen', 'Copperline Transit', 'Fernhill Pet Supply', 'Larkspur Bakery', 'Quartz Cloud Hosting', 'Tidewater Insurance', 'Ironwood Taxi', 'Saffron Table', 'Marlow Office Supply'];
const PRE = ['POS PURCHASE ', 'ACH DEBIT ', 'CHECKCARD ', '', '', 'ONLINE PMT '];
const CREDITS = ['Payroll Deposit Brightfield Ltd', 'Transfer from Savings', 'Refund Northwind Grocers', 'Mobile Check Deposit', 'Interest Paid', 'Client Payment Alder and Co'];

export const LAYOUT_IDS = [
  'bank-signed', 'bank-debit-credit', 'bank-no-balance', 'cc-two-date', 'cc-crdr', 'bank-parens', 'bank-european',
  'bank-multiline', 'bank-multipage', 'bank-year-rollover', 'bank-decoy', 'bank-indian', 'bank-trailing-minus', 'bank-grouped-dates', 'bank-uk-bf', 'bank-password', 'scan-image-only',
] as const;
/** Layouts written AFTER the parser was tuned and never used for debugging (see docs/ACCURACY.md). */
export const HELDOUT_IDS = ['held-left-aligned', 'held-money-in-out', 'held-cc-negative', 'held-check-column'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number] | (typeof HELDOUT_IDS)[number];

const c = (key: Key, x: number, w: number, align: 'left' | 'right', title: string, hAlign?: 'left' | 'right' | 'center'): ColSpec => ({ key, x, w, align, title, ...(hAlign ? { hAlign } : {}) });
const base = { font: 'Helvetica', bold: 'Helvetica-Bold', size: 9, rowH: 15, money: 'us' as MoneyStyle, currency: 'USD', symbol: '$', headerStyle: 'fill' as const, period: 'mdy4' as const, summary: 'lines' as const, rows: [24, 34] as [number, number], repeatHeader: true, openLabel: 'Beginning Balance', closeLabel: 'Ending Balance', dateStyle: 'mdy4' as DateStyle, showBalance: true, acct: 'bank' as const };

const SPECS: Record<string, Spec> = {
  'bank-signed': { ...base, id: 'bank-signed', bank: 'Harborline Savings Bank', amountMode: 'signed', cols: [c('date', 40, 62, 'left', 'Date'), c('desc', 112, 280, 'left', 'Description'), c('amount', 400, 80, 'right', 'Amount'), c('balance', 490, 82, 'right', 'Balance')] },
  'bank-debit-credit': { ...base, id: 'bank-debit-credit', bank: 'Cobalt Federal Credit Union', dateStyle: 'mdy2', amountMode: 'debit-credit', headerStyle: 'rule', totalsRow: true, summary: 'box', period: 'long', cols: [c('date', 40, 55, 'left', 'Date'), c('desc', 105, 230, 'left', 'Description'), c('debit', 345, 70, 'right', 'Withdrawals', 'left'), c('credit', 425, 70, 'right', 'Deposits', 'left'), c('balance', 505, 67, 'right', 'Balance')] },
  'bank-no-balance': { ...base, id: 'bank-no-balance', bank: 'Meridian Trust Company', amountMode: 'debit-credit', showBalance: false, totalsRow: true, summary: 'box', headerStyle: 'plain', cols: [c('date', 40, 60, 'left', 'Date'), c('desc', 110, 250, 'left', 'Description'), c('debit', 380, 90, 'right', 'Debit'), c('credit', 480, 92, 'right', 'Credit')] },
  'cc-two-date': { ...base, id: 'cc-two-date', bank: 'Evergreen Rewards Card', acct: 'creditCard', dateStyle: 'md', amountMode: 'cc-signed', showBalance: false, sections: true, summary: 'box', period: 'mdy4', openLabel: 'Previous Balance', closeLabel: 'New Balance', cols: [c('date', 40, 50, 'left', 'Trans Date'), c('post', 95, 50, 'left', 'Post Date'), c('desc', 155, 300, 'left', 'Description'), c('amount', 470, 102, 'right', 'Amount')] },
  'cc-crdr': { ...base, id: 'cc-crdr', bank: 'Crestline Platinum Card', acct: 'creditCard', dateStyle: 'mon-d', amountMode: 'cc-crdr', showBalance: false, headerStyle: 'rule', period: 'long', summary: 'lines', openLabel: 'Previous Balance', closeLabel: 'New Balance', cols: [c('date', 40, 60, 'left', 'Date'), c('desc', 110, 290, 'left', 'Description'), c('amount', 420, 152, 'right', 'Amount')] },
  'bank-parens': { ...base, id: 'bank-parens', bank: 'Lakeshore Community Bank', font: 'Helvetica', dateStyle: 'mdy2', amountMode: 'parens', balanceStyle: 'parens', negativeBalances: true, headerStyle: 'rule', cols: [c('date', 40, 55, 'left', 'Date'), c('desc', 105, 265, 'left', 'Description'), c('amount', 380, 90, 'right', 'Amount'), c('balance', 480, 92, 'right', 'Balance')] },
  'bank-european': { ...base, id: 'bank-european', bank: 'Nordhaven Handelsbank', dateStyle: 'dmy-dots', money: 'eu', currency: 'EUR', symbol: '€', amountMode: 'debit-credit', period: 'dots', openLabel: 'Opening balance', closeLabel: 'Closing balance', cols: [c('date', 40, 62, 'left', 'Date'), c('desc', 112, 248, 'left', 'Details'), c('debit', 370, 65, 'right', 'Debit'), c('credit', 440, 65, 'right', 'Credit'), c('balance', 510, 62, 'right', 'Balance')] },
  'bank-multiline': { ...base, id: 'bank-multiline', bank: 'Redwood Mutual Bank', font: 'Times-Roman', bold: 'Times-Bold', size: 10, rowH: 14, amountMode: 'signed', multiline: true, repeatHeader: false, rows: [34, 44], headerStyle: 'rule', cols: [c('date', 40, 62, 'left', 'Date'), c('desc', 108, 245, 'left', 'Description'), c('amount', 370, 95, 'right', 'Amount'), c('balance', 475, 97, 'right', 'Balance')] },
  'bank-multipage': { ...base, id: 'bank-multipage', bank: 'Summit Ridge Bank', dateStyle: 'md', amountMode: 'debit-credit', rows: [78, 92], period: 'long', cols: [c('date', 40, 50, 'left', 'Date'), c('desc', 100, 270, 'left', 'Description'), c('debit', 380, 60, 'right', 'Debits'), c('credit', 445, 60, 'right', 'Credits'), c('balance', 510, 62, 'right', 'Balance')] },
  'bank-year-rollover': { ...base, id: 'bank-year-rollover', bank: 'Pacific Dune Bank', dateStyle: 'mon-d', amountMode: 'signed', period: 'rollover', cols: [c('date', 40, 50, 'left', 'Date'), c('desc', 100, 300, 'left', 'Description'), c('amount', 410, 75, 'right', 'Amount'), c('balance', 495, 77, 'right', 'Balance')] },
  'bank-decoy': { ...base, id: 'bank-decoy', bank: 'Granite Peak Bank', amountMode: 'debit-credit', summary: 'decoy', period: 'long', cols: [c('date', 40, 55, 'left', 'Date'), c('desc', 105, 270, 'left', 'Description'), c('debit', 385, 60, 'right', 'Debits'), c('credit', 450, 55, 'right', 'Credits'), c('balance', 510, 62, 'right', 'Balance')] },
  'bank-indian': { ...base, id: 'bank-indian', bank: 'Sagar Cooperative Bank', size: 8, money: 'in', currency: 'INR', symbol: 'INR ', dateStyle: 'dmy-dash', amountMode: 'debit-credit', balanceStyle: 'crdr', period: 'dash', openLabel: 'Opening Balance', closeLabel: 'Closing Balance', cols: [c('date', 40, 58, 'left', 'Txn Date'), c('post', 102, 58, 'left', 'Value Date'), c('desc', 170, 155, 'left', 'Particulars'), c('debit', 330, 70, 'right', 'Debit'), c('credit', 405, 70, 'right', 'Credit'), c('balance', 480, 92, 'right', 'Balance')] },
  'bank-trailing-minus': { ...base, id: 'bank-trailing-minus', bank: 'Atlas Commerce Bank', font: 'Courier', bold: 'Courier-Bold', size: 8.5, amountMode: 'trailing-minus', fragments: true, headerStyle: 'rule', cols: [c('date', 40, 62, 'left', 'DATE'), c('desc', 112, 265, 'left', 'DESCRIPTION'), c('amount', 385, 85, 'right', 'AMOUNT'), c('balance', 480, 92, 'right', 'BALANCE')] },
};
SPECS['bank-grouped-dates'] = { ...SPECS['bank-signed']!, id: 'bank-grouped-dates', bank: 'Tamarind Valley Bank', groupedDates: true, dateStyle: 'mon-d', period: 'long', headerStyle: 'rule' };
SPECS['bank-uk-bf'] = { ...base, id: 'bank-uk-bf', bank: 'Thornbury and Wick Building Society', money: 'us', currency: 'GBP', symbol: '£', dateStyle: 'd-mon-y', amountMode: 'debit-credit', bfRow: true, noSummary: true, headerStyle: 'plain', rows: [40, 52], cols: [c('date', 40, 72, 'left', 'Date'), c('desc', 120, 250, 'left', 'Details'), c('debit', 380, 62, 'right', 'Paid out'), c('credit', 447, 62, 'right', 'Paid in'), c('balance', 514, 58, 'right', 'Balance')] };
SPECS['held-left-aligned'] = { ...base, id: 'held-left-aligned', bank: 'Quillfeather Bank', amountMode: 'signed', leftAlignNumbers: true, headerStyle: 'rule', period: 'long', cols: [c('date', 40, 62, 'left', 'Date', 'left'), c('desc', 112, 270, 'left', 'Description'), c('amount', 395, 85, 'left', 'Amount', 'center'), c('balance', 495, 77, 'left', 'Balance', 'center')] };
SPECS['held-money-in-out'] = { ...base, id: 'held-money-in-out', bank: 'Brackenridge Mutual', currency: 'GBP', symbol: '£', dateStyle: 'd-mon-y', amountMode: 'debit-credit', symbolOnAmounts: true, openLabel: 'Opening Balance', closeLabel: 'Closing Balance', period: 'long', cols: [c('date', 40, 72, 'left', 'Posting Date'), c('desc', 120, 235, 'left', 'Transaction'), c('debit', 362, 64, 'right', 'Money out'), c('credit', 432, 64, 'right', 'Money in'), c('balance', 502, 70, 'right', 'Balance')] };
SPECS['held-cc-negative'] = { ...base, id: 'held-cc-negative', bank: 'Verdant Rewards Visa', acct: 'creditCard', amountMode: 'cc-neg', showBalance: false, extra: 'category', summary: 'box', openLabel: 'Previous Balance', closeLabel: 'New Balance', cols: [c('date', 40, 60, 'left', 'Date'), c('desc', 110, 230, 'left', 'Description'), c('extra', 350, 80, 'left', 'Category'), c('amount', 450, 122, 'right', 'Amount')] };
SPECS['held-check-column'] = { ...base, id: 'held-check-column', bank: 'Ashgrove Credit Union', amountMode: 'debit-credit', extra: 'check', headerStyle: 'plain', cols: [c('date', 40, 58, 'left', 'Date'), c('extra', 100, 50, 'left', 'Check No.'), c('desc', 158, 215, 'left', 'Description'), c('debit', 380, 62, 'right', 'Debit'), c('credit', 447, 62, 'right', 'Credit'), c('balance', 514, 58, 'right', 'Balance')] };
SPECS['bank-password'] = { ...SPECS['bank-signed']!, id: 'bank-password', bank: 'Fernlight Private Bank', password: 'ledger123' };

const fmtMoney = (minor: number, st: MoneyStyle): string => {
  const abs = Math.abs(minor);
  if (st === 'eu') return formatMinor(abs, { thousands: '.', decimal: ',' });
  if (st === 'in') {
    const w = Math.floor(abs / 100);
    const f = String(abs % 100).padStart(2, '0');
    let s = String(w);
    if (s.length > 3) s = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
    return `${s}.${f}`;
  }
  return formatMinor(abs);
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (iso: string, st: DateStyle): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const p = (n: number) => String(n).padStart(2, '0');
  switch (st) {
    case 'mdy4': return `${p(m)}/${p(d)}/${y}`;
    case 'mdy2': return `${p(m)}/${p(d)}/${String(y).slice(2)}`;
    case 'md': return `${p(m)}/${p(d)}`;
    case 'mon-d': return `${MON[m - 1]} ${d}`;
    case 'dmy-dots': return `${p(d)}.${p(m)}.${y}`;
    case 'dmy-dash': return `${p(d)}-${p(m)}-${y}`;
    case 'd-mon-y': return `${p(d)} ${MON[m - 1]} ${y}`;
  }
};
const longDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MONL[m - 1]} ${d}, ${y}`;
};

interface Txn { date: string; post?: string; lines: string[]; amount: number }

function genTxns(rng: Rng, spec: Spec, start: string, end: string): Txn[] {
  const n = rng.int(spec.rows[0], spec.rows[1]);
  const span = isoToDays(end) - isoToDays(start);
  const pool = spec.groupedDates ? Array.from({ length: 9 }, () => rng.int(0, span)) : null;
  const days = Array.from({ length: n }, () => (pool ? rng.pick(pool) : rng.int(0, span))).sort((a, b) => a - b);
  const txns: Txn[] = [];
  days.forEach((off, i) => {
    const date = addDays(start, off);
    let amount: number;
    let desc: string;
    if (spec.acct === 'creditCard') {
      const r = rng.next();
      if (i === 0 || r < 0.1) { amount = rng.int(10000, 90000); desc = 'PAYMENT THANK YOU'; }
      else if (r < 0.17) { amount = rng.int(500, 6000); desc = `Refund ${rng.pick(MERCH)}`; }
      else { amount = -rng.int(300, 32000); desc = `${rng.pick(MERCH)} ${rng.int(100, 999)}`; }
    } else if (rng.next() < 0.22) {
      amount = rng.int(1500, 250000);
      desc = rng.pick(CREDITS);
    } else {
      amount = -(rng.next() < 0.05 ? rng.int(90000, 150000) : rng.int(300, 45000));
      desc = `${rng.pick(PRE)}${rng.pick(MERCH)}${rng.next() < 0.5 ? ` #${rng.int(100, 9999)}` : ''}`;
    }
    const lines = spec.multiline ? [desc, ...(rng.next() < 0.7 ? [`REF ${rng.int(100000, 999999)}`] : []), ...(rng.next() < 0.3 ? [`CARD ${rng.int(1000, 9999)}`] : [])] : [desc];
    const post = spec.cols.some((x) => x.key === 'post') ? addDays(date, rng.int(0, 2)) : undefined;
    txns.push({ date, ...(post ? { post } : {}), lines, amount });
  });
  if (spec.sections) txns.sort((a, b) => (a.amount > 0 ? 0 : 1) - (b.amount > 0 ? 0 : 1) || a.date.localeCompare(b.date));
  return txns;
}

function amountCells(spec: Spec, a: number): Partial<Record<Key, string>> {
  const m = (spec.symbolOnAmounts ? spec.symbol : '') + fmtMoney(a, spec.money);
  switch (spec.amountMode) {
    case 'signed': return { amount: (a < 0 ? '-' : '') + m };
    case 'parens': return { amount: a < 0 ? `(${m})` : m };
    case 'trailing-minus': return { amount: a < 0 ? `${m}-` : m };
    case 'debit-credit': return a < 0 ? { debit: m } : { credit: m };
    case 'cc-signed': return { amount: a < 0 ? m : `-${m}` };
    case 'cc-neg': return { amount: a < 0 ? `-${m}` : m };
    case 'cc-crdr': return { amount: a < 0 ? m : `${m} CR` };
  }
}
function balanceText(spec: Spec, b: number): string {
  const m = (spec.symbolOnAmounts ? spec.symbol : '') + fmtMoney(b, spec.money);
  if (spec.balanceStyle === 'parens') return b < 0 ? `(${m})` : m;
  if (spec.balanceStyle === 'crdr') return `${m} ${b < 0 ? 'Dr' : 'Cr'}`;
  return (b < 0 ? '-' : '') + m;
}

function monthEnd(y: number, m: number): string {
  return addDays(toIso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);
}

function makePng(): Buffer {
  const w = 160, h = 80;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x * 7 + y * 13) % 5 === 0 ? 40 : 235;
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function collect(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  doc.on('data', (d: Buffer) => chunks.push(d));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

export interface GenOptions {
  /** override the number of transactions (performance tests) */
  rows?: number;
  /** draw the statement WITHOUT this transaction while the printed balances still include it (demo of a discrepancy) */
  omitRow?: number;
  /** force the account's last four digits, opening balance (minor units) and statement month (chained statements) */
  last4?: string;
  opening?: number;
  month?: number;
}

export async function generate(layout: LayoutId, seed: number, opts: GenOptions = {}): Promise<Synthetic> {
  const rng = new Rng(seed * 7919 + ([...LAYOUT_IDS, ...HELDOUT_IDS] as readonly string[]).indexOf(layout) * 104729 + 17);
  const last4 = opts.last4 ?? String(rng.int(1000, 9999));
  if (layout === 'scan-image-only') {
    const doc = new PDFDocument({ size: [612, 792], margin: 0, info: { CreationDate: new Date('2025-01-01T00:00:00Z') } });
    doc.image(makePng(), 40, 60, { width: 500 });
    const pdf = await collect(doc);
    const truth: Truth = { layout, seed, accountType: 'bank', accountLast4: last4, currency: 'USD', periodStart: '2025-03-01', periodEnd: '2025-03-31', openingBalanceMinor: 0, closingBalanceMinor: 0, rows: [], expectedError: 'no-text-layer', pageCount: 1 };
    return { pdf, truth };
  }
  const spec = opts.rows ? { ...SPECS[layout]!, rows: [opts.rows, opts.rows] as [number, number] } : SPECS[layout]!;
  // period
  let start: string, end: string;
  if (spec.period === 'rollover') { start = '2024-12-15'; end = '2025-01-14'; }
  else if (spec.acct === 'creditCard') { const m = rng.int(1, 10); start = toIso(2025, m, 5); end = toIso(2025, m + 1, 4); }
  else { const m = opts.month ?? rng.int(1, 11); start = toIso(2025, m, 1); end = monthEnd(2025, m); }

  const txns = genTxns(rng, spec, start, end);
  const isCC = spec.acct === 'creditCard';
  const opening = opts.opening ?? (isCC ? rng.int(20000, 300000) : spec.negativeBalances ? rng.int(2000, 30000) : rng.int(150000, 900000));
  const rows: TruthRow[] = [];
  let bal = opening;
  for (const t of txns) {
    bal += isCC ? -t.amount : t.amount;
    rows.push({ date: t.date, description: t.lines.join(' '), amountMinor: t.amount, balanceMinor: spec.showBalance ? bal : null });
  }
  const closing = bal;

  const doc = new PDFDocument({ size: [612, 792], margin: 0, bufferPages: true, info: { Title: `${spec.bank} sample statement`, Author: 'LedgerLocal synthetic generator', CreationDate: new Date('2025-01-01T00:00:00Z'), ModDate: new Date('2025-01-01T00:00:00Z') }, ...(spec.password ? { userPassword: spec.password, ownerPassword: `${spec.password}-owner`, pdfVersion: '1.7ext3' as const } : {}) });
  const F = spec.font, B = spec.bold, S = spec.size;
  const put = (text: string, x: number, y: number, o: { w?: number; align?: 'left' | 'right' | 'center'; bold?: boolean; size?: number; color?: string; frag?: boolean } = {}) => {
    doc.font(o.bold ? B : F).fontSize(o.size ?? S).fillColor(o.color ?? '#111111');
    const wid = doc.widthOfString(text);
    const x0 = o.w !== undefined && o.align === 'right' ? x + o.w - wid : o.w !== undefined && o.align === 'center' ? x + (o.w - wid) / 2 : x;
    if (o.frag && text.includes(' ')) {
      const words = text.split(' ');
      let acc = '';
      for (const w of words) { doc.text(w, x0 + doc.widthOfString(acc), y, { lineBreak: false }); acc += w + ' '; }
    } else doc.text(text, x0, y, { lineBreak: false });
  };
  const col = (k: Key) => spec.cols.find((x) => x.key === k);
  const sym = spec.symbol;
  const money = (v: number, neg = false) => `${neg || v < 0 ? '-' : ''}${sym}${fmtMoney(v, spec.money)}`;

  // ---- page 1 header
  put(spec.bank, 40, 38, { bold: true, size: 16 });
  put(isCC ? 'Credit Card Statement' : 'Statement of Account', 40, 60, { size: 11 });
  put(isCC ? `Card Number: XXXX XXXX XXXX ${last4}` : `Account Number: XXXXXX${last4}`, 40, 78);
  const pl = spec.noSummary ? '' : spec.period === 'mdy4' ? `${fmtDate(start, 'mdy4')} - ${fmtDate(end, 'mdy4')}` : spec.period === 'dots' ? `${fmtDate(start, 'dmy-dots')} - ${fmtDate(end, 'dmy-dots')}` : spec.period === 'dash' ? `${fmtDate(start, 'dmy-dash')} to ${fmtDate(end, 'dmy-dash')}` : `${longDate(start)} through ${longDate(end)}`;
  if (!spec.noSummary) put(`Statement Period: ${pl}`, 40, 92);
  else put(`All amounts are in ${spec.symbol.trim()} ${spec.currency === 'GBP' ? 'Sterling' : spec.currency}`, 40, 92);
  let y = 112;
  const totalIn = rows.filter((r) => r.amountMinor > 0).reduce((s, r) => s + r.amountMinor, 0);
  const totalOut = rows.filter((r) => r.amountMinor < 0).reduce((s, r) => s - r.amountMinor, 0);
  const sumLines: [string, string][] = isCC
    ? [[spec.openLabel, money(opening)], ['Payments and Other Credits', money(-totalIn)], ['Purchases and Other Charges', money(totalOut)], [spec.closeLabel, money(closing)], ['Credit Limit', money(500000)], ['Minimum Payment Due', money(3500)]]
    : [[spec.openLabel, money(opening)], ['Deposits and Other Credits', money(totalIn)], ['Withdrawals and Other Debits', money(totalOut)], [spec.closeLabel, money(closing)]];
  if (!spec.noSummary && (spec.summary === 'box' || spec.summary === 'decoy')) doc.lineWidth(0.6).strokeColor('#888888').rect(36, y - 4, 270, sumLines.length * 14 + 8).stroke();
  if (!spec.noSummary) for (const [l, v] of sumLines) { put(l, 44, y, { size: 9 }); put(v, 180, y, { w: 118, align: 'right', size: 9 }); y += 14; }
  if (spec.summary === 'decoy') {
    doc.lineWidth(0.6).strokeColor('#888888').rect(330, 108, 240, 70).stroke();
    put('Account Activity', 338, 112, { bold: true, size: 9 });
    put('Average Daily Balance', 338, 128, { size: 9 }); put(money(Math.round((opening + closing) / 2)), 470, 128, { w: 92, align: 'right', size: 9 });
    put('Total Deposits', 338, 142, { size: 9 }); put(money(totalIn + 12345), 470, 142, { w: 92, align: 'right', size: 9 });
    put('Total Withdrawals', 338, 156, { size: 9 }); put(money(totalOut + 12345), 470, 156, { w: 92, align: 'right', size: 9 });
  }
  if (isCC) { put('Payment Due Date', 44, y + 2, { size: 9 }); put(fmtDate(addDays(end, 25), 'mdy4'), 180, y + 2, { w: 118, align: 'right', size: 9 }); y += 14; }
  y += 24;

  const bottom = 735;
  const left = 40, right = 572;
  const drawHeader = (yy: number): number => {
    if (spec.headerStyle === 'fill') doc.rect(left, yy - 3, right - left, 14).fill('#26405f');
    spec.cols.forEach((cs) => put(cs.title, cs.x, yy, { w: cs.w, align: cs.hAlign ?? cs.align, bold: true, size: S, color: spec.headerStyle === 'fill' ? '#ffffff' : '#111111' }));
    if (spec.headerStyle === 'rule') doc.lineWidth(0.8).strokeColor('#222222').moveTo(left, yy + 12).lineTo(right, yy + 12).stroke();
    return yy + 18;
  };
  const newPage = (): number => {
    doc.addPage();
    put(`${spec.bank}  |  Statement continued  |  Account ending ${last4}`, 40, 36, { size: 8 });
    let yy = 56;
    if (spec.repeatHeader) { put('Transactions (continued)', 40, yy, { bold: true, size: 9 }); yy = drawHeader(yy + 16); }
    return yy;
  };

  let lastDrawnDate = '';
  const drawTxn = (t: Txn, r: TruthRow): void => {
    const h = spec.rowH + (t.lines.length - 1) * (S + 2);
    if (y + h > bottom) y = newPage();
    const dc = col('date')!;
    if (!(spec.groupedDates && lastDrawnDate === t.date)) put(fmtDate(t.date, spec.dateStyle), dc.x, y, { size: S, frag: spec.fragments });
    lastDrawnDate = t.date;
    const pc = col('post');
    if (pc) put(fmtDate(t.post ?? t.date, spec.dateStyle), pc.x, y, { size: S });
    const dsc = col('desc')!;
    t.lines.forEach((ln, i) => {
      let txt = ln;
      doc.font(F).fontSize(S);
      while (doc.widthOfString(txt) > dsc.w - 4 && txt.includes(' ')) txt = txt.slice(0, txt.lastIndexOf(' '));
      if (i === 0 && txt !== ln) r.description = r.description.replace(ln, txt);
      put(txt, dsc.x, y + i * (S + 2), { size: S, frag: spec.fragments });
    });
    const cells = amountCells(spec, t.amount);
    for (const k of ['amount', 'debit', 'credit'] as const) { const v = cells[k]; const cs = col(k); if (v && cs) put(v, cs.x, y, { w: cs.w, align: cs.align, size: S, frag: false }); }
    const ex = col('extra');
    if (ex) { const txt = spec.extra === 'category' ? ['Groceries', 'Fuel', 'Dining', 'Travel', 'Utilities', 'Health'][(t.lines[0]!.length + Math.abs(t.amount)) % 6]! : t.amount < 0 && Math.abs(t.amount) % 3 === 0 ? String(1000 + (Math.abs(t.amount) % 900)) : ''; if (txt) put(txt, ex.x, y, { size: S }); }
    if (spec.showBalance && r.balanceMinor !== null) { const bc = col('balance')!; put(balanceText(spec, r.balanceMinor), bc.x, y, { w: bc.w, align: bc.align, size: S }); }
    y += h;
  };

  if (spec.sections) {
    const groups: [string, Txn[], TruthRow[], boolean][] = [
      ['Payments and Other Credits', txns.filter((t) => t.amount > 0), rows.filter((r) => r.amountMinor > 0), true],
      ['Purchases and Other Charges', txns.filter((t) => t.amount < 0), rows.filter((r) => r.amountMinor < 0), false],
    ];
    for (const [title, ts, rs, isPay] of groups) {
      put(title, 40, y, { bold: true, size: 10 }); y = drawHeader(y + 16);
      ts.forEach((t, i) => drawTxn(t, rs[i]!));
      const tot = ts.reduce((s, t) => s + Math.abs(t.amount), 0);
      put(`Total ${title}`, 40, y + 2, { bold: true, size: S }); put(money(tot, isPay), 470, y + 2, { w: 102, align: 'right', bold: true, size: S });
      y += 30;
    }
    // document order follows sections (payments first); make truth rows follow the same order
    const ord = [...groups[0]![2], ...groups[1]![2]];
    rows.splice(0, rows.length, ...ord);
    // running chain not printed for cards
  } else {
    y = drawHeader(y);
    const bc0 = col('balance');
    if (spec.bfRow && bc0) {
      put(fmtDate(start, spec.dateStyle), col('date')!.x, y, { size: S });
      put('BALANCE BROUGHT FORWARD', col('desc')!.x, y, { size: S });
      put(balanceText(spec, opening), bc0.x, y, { w: bc0.w, align: 'right', size: S });
      y += spec.rowH;
    }
    txns.forEach((t, i) => { if (opts.omitRow !== i) drawTxn(t, rows[i]!); });
    if (spec.bfRow && bc0) {
      y += 2;
      put('BALANCE CARRIED FORWARD', col('desc')!.x, y, { size: S });
      put(balanceText(spec, closing), bc0.x, y, { w: bc0.w, align: 'right', size: S });
      y += spec.rowH;
    }
    if (spec.totalsRow) {
      y += 4;
      put('Totals', 40, y, { bold: true, size: S });
      const d = col('debit'), cr = col('credit');
      if (d) put(fmtMoney(totalOut, spec.money), d.x, y, { w: d.w, align: 'right', bold: true, size: S });
      if (cr) put(fmtMoney(totalIn, spec.money), cr.x, y, { w: cr.w, align: 'right', bold: true, size: S });
      y += 24;
    }
    if (spec.summary === 'decoy') {
      if (y + 140 > bottom) y = newPage();
      y += 12;
      put('Daily Balance Summary', 40, y, { bold: true, size: 10 }); y += 16;
      put('Date', 40, y, { bold: true, size: S }); const bc = col('balance')!; put('Balance', bc.x, y, { w: bc.w, align: 'right', bold: true, size: S }); y += 14;
      for (const idx of [0, Math.floor(rows.length / 3), Math.floor(rows.length / 2), rows.length - 1]) {
        const r = rows[idx]!;
        put(fmtDate(r.date, spec.dateStyle), 40, y, { size: S }); put(fmtMoney(r.balanceMinor ?? 0, spec.money), bc.x, y, { w: bc.w, align: 'right', size: S }); y += 13;
      }
      y += 10;
      put('Interest Paid This Period', 40, y, { size: S }); put('1.23', 450, y, { w: 60, align: 'right', size: S }); y += 13;
    }
  }

  const pages = doc.bufferedPageRange().count;
  for (let i = 0; i < pages; i++) {
    doc.switchToPage(i);
    put(`Page ${i + 1} of ${pages}`, 270, 752, { size: 8 });
    put('Fictional statement generated for software testing. Not a real bank.', 40, 768, { size: 7 });
  }
  const pdf = await collect(doc);
  const truth: Truth = { layout, seed, accountType: spec.acct, accountLast4: last4, currency: spec.currency, periodStart: start, periodEnd: end, openingBalanceMinor: opening, closingBalanceMinor: closing, rows, printsPeriod: !spec.noSummary, ...(spec.password ? { password: spec.password } : {}), pageCount: pages };
  return { pdf, truth };
}
