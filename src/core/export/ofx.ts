/**
 * OFX 1.0.2 (SGML) writer for bank and credit-card accounts; with `qbo: true` it adds the Intuit
 * INTU.BID element QuickBooks Web Connect expects (.QBO). See docs/RESEARCH.md §3 for the spec notes.
 * Output is deterministic: no wall-clock time is used (DTSERVER = statement end date).
 */
import { sha256Hex } from '../hash';
import { currencyExponent, minorToPlain } from '../money';
import type { ExportSettings, Statement } from '../model';
import { sortChronological, type ExportRow } from './shared';

/** ASCII-only, SGML-safe text. */
export function ofxText(s: string): string {
  const ascii = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  return ascii.replace(/\s+/g, ' ').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const ofxDate = (iso: string): string => `${iso.replace(/-/g, '')}120000[0:GMT]`;
const normDesc = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Deterministic unique FITIDs: sha256(account | date | amount | original description | occurrence),
 * truncated; the occurrence counter separates genuinely identical transactions. Independent of the
 * file name, so the same transaction in overlapping statements gets the same FITID (QuickBooks and
 * Xero then skip it as a duplicate).
 */
export function makeFitids(rows: readonly ExportRow[], acctKey: string): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of sortChronological(rows)) {
    const base = `${acctKey}|${r.date}|${r.amountMinor}|${normDesc(r.sourceDescription || r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(r.id, 'LL' + sha256Hex(`${base}|${n}`).slice(0, 22));
  }
  return out;
}

export interface OfxInput {
  statement: Pick<Statement, 'accountType' | 'accountLast4' | 'currency' | 'periodStart' | 'periodEnd' | 'closingBalanceMinor'>;
  rows: readonly ExportRow[];
}

export function buildOfx(input: OfxInput, s: ExportSettings, qbo: boolean): { text: string; fitids: Map<string, string> } {
  const st = input.statement;
  const exp = currencyExponent(st.currency);
  const rows = sortChronological(input.rows);
  if (!rows.length) throw new Error('There are no transactions to export.');
  const acctId = ofxText(st.accountLast4 ?? '0000');
  const acctKey = `${st.accountType}:${acctId}:${st.currency}`;
  const fitids = makeFitids(rows, acctKey);
  const first = rows[0]!.date;
  const last = rows[rows.length - 1]!.date;
  const dtStart = st.periodStart ?? first;
  const dtEnd = st.periodEnd ?? last;
  const lines: string[] = [];
  const L = (x: string) => lines.push(x);
  for (const h of ['OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'SECURITY:NONE', 'ENCODING:USASCII', 'CHARSET:1252', 'COMPRESSION:NONE', 'OLDFILEUID:NONE', 'NEWFILEUID:NONE', '']) L(h);
  L('<OFX>');
  L('<SIGNONMSGSRSV1>');
  L('<SONRS>');
  L('<STATUS><CODE>0<SEVERITY>INFO</STATUS>');
  L(`<DTSERVER>${ofxDate(dtEnd)}`);
  L('<LANGUAGE>ENG');
  L(`<FI><ORG>${ofxText(s.fiOrg)}<FID>${ofxText(s.fiFid)}</FI>`);
  if (qbo) L(`<INTU.BID>${ofxText(s.intuBid)}`);
  L('</SONRS>');
  L('</SIGNONMSGSRSV1>');
  const isCC = st.accountType === 'creditCard';
  const wrap = isCC ? ['CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS'] : ['BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS'];
  L(`<${wrap[0]}>`);
  L(`<${wrap[1]}>`);
  L('<TRNUID>1');
  L('<STATUS><CODE>0<SEVERITY>INFO</STATUS>');
  L(`<${wrap[2]}>`);
  L(`<CURDEF>${ofxText(st.currency)}`);
  if (isCC) L(`<CCACCTFROM><ACCTID>${acctId}</CCACCTFROM>`);
  else L(`<BANKACCTFROM><BANKID>${ofxText(s.bankRoutingId)}<ACCTID>${acctId}<ACCTTYPE>${s.accountTypeOfx}</BANKACCTFROM>`);
  L('<BANKTRANLIST>');
  L(`<DTSTART>${ofxDate(dtStart)}`);
  L(`<DTEND>${ofxDate(dtEnd)}`);
  for (const r of rows) {
    const desc = r.payee?.trim() || r.description.trim() || 'Transaction';
    const name = ofxText(desc).slice(0, 32).trim();
    const memoSrc = r.payee?.trim() ? `${r.description}${r.memo ? ' ' + r.memo : ''}` : desc.length > 32 || r.memo ? `${desc}${r.memo ? ' ' + r.memo : ''}` : '';
    L('<STMTTRN>');
    L(`<TRNTYPE>${r.amountMinor >= 0 ? 'CREDIT' : 'DEBIT'}`);
    L(`<DTPOSTED>${ofxDate(r.postDate ?? r.date)}`);
    if (r.postDate && r.postDate !== r.date) L(`<DTUSER>${ofxDate(r.date)}`);
    L(`<TRNAMT>${minorToPlain(r.amountMinor, exp)}`);
    L(`<FITID>${fitids.get(r.id)}`);
    L(`<NAME>${name || 'Transaction'}`);
    const memo = ofxText(memoSrc).slice(0, 255);
    if (memo) L(`<MEMO>${memo}`);
    L('</STMTTRN>');
  }
  L('</BANKTRANLIST>');
  if (st.closingBalanceMinor !== null) {
    // OFX ledger balance for a card is what you OWE as a negative number.
    const bal = isCC ? -st.closingBalanceMinor : st.closingBalanceMinor;
    L('<LEDGERBAL>');
    L(`<BALAMT>${minorToPlain(bal, exp)}`);
    L(`<DTASOF>${ofxDate(dtEnd)}`);
    L('</LEDGERBAL>');
  }
  L(`</${wrap[2]}>`);
  L(`</${wrap[1]}>`);
  L(`</${wrap[0]}>`);
  L('</OFX>');
  return { text: lines.join('\r\n') + '\r\n', fitids };
}
