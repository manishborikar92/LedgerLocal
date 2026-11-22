/** Template data for the guides (one page per entry). Statements about file formats are generic, not about specific banks. */
export interface Guide { slug: string; title: string; lede: string; sections: { h: string; p: string[] }[] }
export const GUIDES: Guide[] = [
  {
    slug: 'signed-vs-debit-credit',
    title: 'Signed amounts or separate debit/credit columns?',
    lede: 'The two most common ways a statement prints money. Reading them correctly is most of the work in a converter.',
    sections: [
      { h: 'Signed single column', p: ['One “Amount” column where withdrawals carry a minus sign, sit in parentheses, or end in a trailing minus (45.00-). Some statements add CR/DR suffixes instead of a sign.', 'LedgerLocal normalises all of these to one convention: money into the account is positive, money out is negative.'] },
      { h: 'Separate debit and credit columns', p: ['Two columns, often titled Withdrawals/Deposits, Paid out/Paid in, or Debit/Credit. A row has a value in one of them. The column, not a sign, tells you the direction.', 'The column headers define zones on the page; you can drag the column guides if a statement’s headers are unusual.'] },
      { h: 'Why reconciliation matters here', p: ['A single flipped sign changes the total by twice the amount. The proof strip tells you the difference and, when the statement prints a running balance, the first row where it stops matching.'] },
    ],
  },
  {
    slug: 'credit-card-vs-bank',
    title: 'Credit-card statements vs bank statements',
    lede: 'The arithmetic is mirrored, which is why card statements are easy to import with the wrong sign.',
    sections: [
      { h: 'Bank account', p: ['Opening balance + money in − money out = closing balance. A purchase reduces the balance.'] },
      { h: 'Credit card', p: ['Previous balance + charges − payments and credits = new balance. The balance is what you owe, so a purchase increases it.', 'Accounting file formats record a card purchase as a negative amount (money out) and a payment as positive, so LedgerLocal flips the printed sign convention for cards and shows both in the proof strip.'] },
      { h: 'Statements that print charges as negatives', p: ['Some issuers print charges with a minus sign. If the rows only reconcile after flipping every sign, LedgerLocal flips them and records that in the statement notes; it never does this silently.'] },
    ],
  },
  {
    slug: 'qbo-ofx-explained',
    title: 'What is inside a .QBO or OFX file?',
    lede: 'Both are text files describing one account and a list of transactions.',
    sections: [
      { h: 'The pieces that matter', p: ['A header, the institution (ORG/FID), the account (ACCTID, type), a transaction list, and the ledger balance. Each transaction has a type (DEBIT/CREDIT), a posted date, a signed amount, a name and a memo.', 'The FITID is a transaction id that must be unique within the account. Accounting software uses it to skip transactions it has already imported.'] },
      { h: 'QBO vs OFX', p: ['A .QBO (Web Connect) file is OFX with an extra Intuit element, INTU.BID, that tells QuickBooks which financial institution the file belongs to. Plain OFX is accepted by many other tools.', 'LedgerLocal derives FITIDs from the account, date, amount, original description and a repeat counter, so exporting overlapping months twice does not create duplicates.'] },
      { h: 'Importing', p: ['QuickBooks Desktop typically uses File → Utilities → Import → Web Connect Files. QuickBooks Online has an upload-transactions option under Banking. Xero has an import-a-statement option on the bank account. Menu names change between versions, and the authors of LedgerLocal have not been able to test imports in the real products: check the vendor’s current help pages.'] },
    ],
  },
  {
    slug: 'verify-offline',
    title: 'How to check that a converter really works offline',
    lede: 'Do not take a privacy claim on trust, including ours.',
    sections: [
      { h: 'Watch the network', p: ['Open your browser’s developer tools and the Network tab, clear it, then import a statement. A truly local tool shows no new requests.'] },
      { h: 'Go offline', p: ['Tick “Offline” in the Network tab (or switch on airplane mode) and import another statement. It should still work.'] },
      { h: 'Read the policy', p: ['A page’s Content-Security-Policy can make uploads impossible, not just unlikely. LedgerLocal’s workbench page (/app/) declares connect-src \u0027none\u0027, which blocks fetch, XHR, WebSocket, form posts and beacons; the other pages only allow requests to their own site. You can read the policy in the response headers: open the Network tab, click the /app/ document and look for Content-Security-Policy.'] },
    ],
  },
];
