"""Independent XLSX validation with openpyxl (formulas + cached values)."""
import json, sys
from openpyxl import load_workbook

path = sys.argv[1]
wf = load_workbook(path)               # formulas
wv = load_workbook(path, data_only=True)  # cached / recalculated values
tx, rec = wf["Transactions"], wf["Reconciliation"]
txv, recv = wv["Transactions"], wv["Reconciliation"]
out = {
    "sheets": wf.sheetnames,
    "tx_rows": tx.max_row - 1,
    "header": [c.value for c in tx[1]][:7],
    "first_amount": txv["G2"].value,
    "first_date_is_date": type(txv["B2"].value).__name__,
    "has_formula": isinstance(rec["E5"].value, str) and rec["E5"].value.startswith("="),
    "status": recv["J5"].value,
    "difference": recv["I5"].value,
    "computed": recv["G5"].value,
    "closing": recv["H5"].value,
}
print(json.dumps(out, default=str))
