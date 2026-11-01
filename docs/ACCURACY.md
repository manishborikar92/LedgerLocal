# Accuracy report — on synthetic layouts

> **Read this first.** These numbers are measured on *synthetic* statements produced by this repository's own generator
> (`tools/synth`), for *fictional* banks. The same author wrote the generator and the parser, so the figures are an
> optimistic ceiling, not a forecast for real-world statements. Real statements add scanned pages, odd fonts, merged cells,
> rotated pages and layouts nobody here has seen. Always check the green/red **reconciliation** status on every file.

Method: for each layout, 10 statements were generated with seeds 201–210 (never used while developing). Each PDF was parsed with the
production parser (pdf.js text extraction + `core/parse`) and compared with the generator's ground-truth JSON.
Rows are matched on (date, signed amount); description is compared exactly after whitespace/case normalisation.
"Reconciled" = the app reported RECONCILED (opening + movements = closing) for the file; "metadata" = account type, last-4,
period, currency and both balances all correct.

| Layout | Files | Row recall | Row precision | Description exact | Reconciled | Metadata all correct |
|---|---:|---:|---:|---:|---:|---:|
| `bank-signed` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-debit-credit` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-no-balance` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `cc-two-date` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `cc-crdr` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-parens` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-european` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-multiline` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-multipage` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-year-rollover` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-decoy` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-indian` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-trailing-minus` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-grouped-dates` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-uk-bf` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `bank-password` | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `scan-image-only` | 10 | — | — | — | — | rejected with "no text layer": 10/10 |
| `held-left-aligned` † | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `held-money-in-out` † | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `held-cc-negative` † | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |
| `held-check-column` † | 10 | 100.0% | 100.0% | 100.0% | 10/10 | 10/10 |

**Overall (text layouts):** 6717/6717 rows recovered (100.0% recall, 100.0% precision); 200/200 statements reconciled.

† *Held-out layouts.* These four layouts were written after the parser was tuned. On their first run two of them failed outright
(a lone "Posting Date" header was mis-classified so no table was found; a card statement that prints charges as negatives came out with every
sign inverted). Both were fixed (see docs/DECISIONS.md D-12), so these layouts are no longer pristine; the seeds above are fresh, the layouts are not.

## What this does not measure
* Scanned / image-only PDFs: rejected with a clear message (OCR is roadmap). `scan-image-only` above verifies the rejection only.
* Real bank layouts, ligature-heavy fonts, rotated pages, statements where columns are drawn as images, multi-currency tables.
* The previously cited "~83% for rule-based converters on unfamiliar layouts" claim could not be verified from a primary source and is not used anywhere in the product (docs/RESEARCH.md §1).
