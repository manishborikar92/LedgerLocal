"""Independent OFX/QBO validation with the third-party `ofxparse` library (pip install ofxparse)."""
import json, sys
from ofxparse import OfxParser

with open(sys.argv[1], "rb") as f:
    ofx = OfxParser.parse(f)
acct = ofx.account
st = acct.statement
print(json.dumps({
    "count": len(st.transactions),
    "total": str(sum(t.amount for t in st.transactions)),
    "unique_fitids": len({t.id for t in st.transactions}),
    "balance": str(st.balance),
    "acct_id": acct.account_id,
    "currency": st.currency,
    "first_date": st.transactions[0].date.strftime("%Y-%m-%d"),
    "first_name": st.transactions[0].payee,
    "types": sorted({t.type for t in st.transactions}),
    "institution": getattr(getattr(ofx.account, "institution", None), "organization", None),
}))
