"""
Step 5: For Patient-only items, swap in Pathologies:
- html: replace /liens-utiles/{lu-slug} with /recommandations/{cp-slug}
- liens-utile: remove LU item ID
- recommandations-2: add CP item ID

Usage: python 05_swap_pathologies_patient.py <sheet_key> [gid] [--dry-run]
"""
import json, glob, os, sys
from collections import defaultdict
from config import SANDBOX_BASE, get_gspread_client

SHEET_KEY = sys.argv[1]
GID = int(sys.argv[2]) if len(sys.argv) > 2 else 0
DRY_RUN = '--dry-run' in sys.argv

# Read sheet — expects columns: A=Item ID, C=Slug, N=CP Item ID, O=CP Slug
# Filter: only rows where Patient/Médecin = "Patient" and Présence != "Aucun"
gc = get_gspread_client()
sh = gc.open_by_key(SHEET_KEY)
ws = sh.get_worksheet_by_id(GID)
data = ws.get_all_values()

lu_to_info = {}
lu_to_row = {}
for i, row in enumerate(data[1:], 2):
    statut = row[6] if len(row) > 6 else ''
    pm = row[10] if len(row) > 10 else ''          # Patient/Médecin
    presence = row[11] if len(row) > 11 else ''     # Présence Pathologies
    lu_id = row[0].strip()
    lu_slug = row[2].strip()
    cp_id = row[13].strip() if len(row) > 13 else ''
    cp_slug = row[14].strip() if len(row) > 14 else ''

    if (statut != 'Ignorer' and pm == 'Patient'
            and presence not in ('Aucun', '')
            and lu_id and cp_id and cp_slug):
        lu_to_info[lu_id] = {'lu_slug': lu_slug, 'cp_id': cp_id, 'cp_slug': cp_slug}
        lu_to_row[lu_id] = i

print(f"Items to swap: {len(lu_to_info)}")

# Group changes by pathology
patho_dir = os.path.join(SANDBOX_BASE, 'Pathologies')
patho_changes = defaultdict(list)
lu_patho_slugs = defaultdict(list)

for f in glob.glob(os.path.join(patho_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    fd = d.get('fieldData', {})
    liens = fd.get('liens-utile', [])
    html = fd.get('html', '')
    patho_slug = fd.get('slug', '')

    for lu_id, info in lu_to_info.items():
        in_liens = lu_id in liens
        in_html = f'/liens-utiles/{info["lu_slug"]}' in html
        if in_liens or in_html:
            patho_changes[f].append((lu_id, info))
            lu_patho_slugs[lu_id].append(patho_slug)

# Execute
total = 0
for filepath, changes in patho_changes.items():
    with open(filepath) as fh:
        d = json.load(fh)

    fd = d['fieldData']
    liens = fd.get('liens-utile', [])
    reco = fd.get('recommandations-2', [])
    html = fd.get('html', '')
    patho_name = fd.get('name', '')

    for lu_id, info in changes:
        # Remove from liens-utile
        if lu_id in liens:
            liens.remove(lu_id)
        # Add CP to recommandations-2
        if info['cp_id'] not in reco:
            reco.append(info['cp_id'])
        # Replace in html
        old_path = f'/liens-utiles/{info["lu_slug"]}'
        new_path = f'/recommandations/{info["cp_slug"]}'
        html = html.replace(old_path, new_path)
        total += 1

        if DRY_RUN:
            print(f"  {patho_name}: {old_path} -> {new_path}")

    fd['liens-utile'] = liens
    fd['recommandations-2'] = reco
    fd['html'] = html

    if not DRY_RUN:
        with open(filepath, 'w') as fh:
            json.dump(d, fh, indent=2, ensure_ascii=False)

print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Total: {total} swaps across {len(patho_changes)} pathologies")

# Update column P
if not DRY_RUN:
    cells = []
    for lu_id, patho_slugs in lu_patho_slugs.items():
        row_num = lu_to_row.get(lu_id)
        if row_num:
            cells.append({'range': f'P{row_num}', 'values': [['; '.join(patho_slugs)]]})

    if cells:
        ws.update('P1', [['Pathologie(s) swappée(s)']], value_input_option='RAW')
        ws.format('P1', {'textFormat': {'bold': True}})
        ws.batch_update(cells, value_input_option='RAW')
        print(f"Updated {len(cells)} rows in column P")

    print("\nRun: scratchmd files upload")
