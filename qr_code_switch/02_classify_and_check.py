"""
Step 2: For an existing Google Sheet, add columns:
- H: PDF? (TRUE/FALSE via HTTP HEAD)
- I: Sole QR of CP (slug of CP where this LU is the only qr-code)
- J: Présence Pathologies (Rappel clinique / Onglet / Les 2 / Aucun)

Usage: python 02_classify_and_check.py <sheet_key> [gid]
"""
import json, glob, os, sys, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from config import SANDBOX_BASE, get_gspread_client

SHEET_KEY = sys.argv[1]
GID = int(sys.argv[2]) if len(sys.argv) > 2 else 0

gc = get_gspread_client()
sh = gc.open_by_key(SHEET_KEY)
ws = sh.get_worksheet_by_id(GID)
data = ws.get_all_values()
print(f"Rows: {len(data) - 1}")

# --- PDF check ---
def check_pdf(url):
    if not url:
        return 'FALSE'
    try:
        r = requests.head(url, timeout=10, allow_redirects=True)
        if 'application/pdf' in r.headers.get('Content-Type', ''):
            return 'TRUE'
        if r.status_code >= 400:
            r = requests.get(url, timeout=10, allow_redirects=True, stream=True)
            ct = r.headers.get('Content-Type', '')
            r.close()
            if 'application/pdf' in ct:
                return 'TRUE'
    except:
        pass
    if url.lower().rstrip('/').endswith('.pdf'):
        return 'TRUE'
    return 'FALSE'

print("Checking PDFs...")
pdf_results = {}
with ThreadPoolExecutor(max_workers=20) as executor:
    futures = {}
    for i, row in enumerate(data[1:], 2):
        url = row[3].strip() if len(row) > 3 else ''
        futures[executor.submit(check_pdf, url)] = i
    for j, future in enumerate(as_completed(futures), 1):
        pdf_results[futures[future]] = future.result()
        if j % 50 == 0:
            print(f"  {j}/{len(futures)} done")
print(f"  {len(futures)}/{len(futures)} done")

# --- Sole QR of CP ---
cp_dir = os.path.join(SANDBOX_BASE, 'Conseils patients')
lu_to_sole = defaultdict(list)
for f in glob.glob(os.path.join(cp_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    qr = d.get('fieldData', {}).get('qr-codes', [])
    if len(qr) == 1:
        lu_to_sole[qr[0]].append(d.get('fieldData', {}).get('slug', ''))

# --- Présence Pathologies ---
patho_dir = os.path.join(SANDBOX_BASE, 'Pathologies')
lu_in_html = set()
lu_in_ref = set()

item_slugs = {row[3 if len(row) > 3 else 0]: row[2].strip() for row in data[1:]}
all_item_ids = set(row[0].strip() for row in data[1:])

for f in glob.glob(os.path.join(patho_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    fd = d.get('fieldData', {})
    html = fd.get('html', '')
    liens = fd.get('liens-utile', [])

    for row in data[1:]:
        item_id = row[0].strip()
        slug = row[2].strip()
        if slug and f'/liens-utiles/{slug}' in html:
            lu_in_html.add(item_id)
        if item_id in liens:
            lu_in_ref.add(item_id)

# --- Build and write results ---
h_col = [['PDF ?']]
i_col = [['Sole QR of CP (slug)']]
j_col = [['Présence Pathologies']]

for row in data[1:]:
    item_id = row[0].strip()
    row_num = data.index(row) + 1

    h_col.append([pdf_results.get(row_num + 1, '')])

    sole = lu_to_sole.get(item_id, [])
    i_col.append(['; '.join(sole) if sole else ''])

    in_html = item_id in lu_in_html
    in_ref = item_id in lu_in_ref
    if in_html and in_ref:
        j_col.append(['Les 2'])
    elif in_html:
        j_col.append(['Rappel clinique'])
    elif in_ref:
        j_col.append(['Onglet'])
    else:
        j_col.append(['Aucun'])

ws.update(values=h_col, range_name=f'H1:H{len(h_col)}', value_input_option='RAW')
ws.update(values=i_col, range_name=f'I1:I{len(i_col)}', value_input_option='RAW')
ws.update(values=j_col, range_name=f'J1:J{len(j_col)}', value_input_option='RAW')
ws.format('H1:J1', {'textFormat': {'bold': True}})

print("Done — columns H, I, J written")
