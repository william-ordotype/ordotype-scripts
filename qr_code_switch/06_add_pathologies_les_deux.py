"""
Step 6: For "Les deux" items, add CP to recommandations-2 WITHOUT removing from liens-utile.

Usage: python 06_add_pathologies_les_deux.py <sheet_key> [gid] [--dry-run]
"""
import json, glob, os, sys
from collections import defaultdict
from config import SANDBOX_BASE, get_gspread_client

SHEET_KEY = sys.argv[1]
GID = int(sys.argv[2]) if len(sys.argv) > 2 else 0
DRY_RUN = '--dry-run' in sys.argv

gc = get_gspread_client()
sh = gc.open_by_key(SHEET_KEY)
ws = sh.get_worksheet_by_id(GID)
data = ws.get_all_values()

lu_to_cp = {}
lu_to_row = {}
for i, row in enumerate(data[1:], 2):
    statut = row[6] if len(row) > 6 else ''
    pm = row[10] if len(row) > 10 else ''
    presence = row[11] if len(row) > 11 else ''
    lu_id = row[0].strip()
    cp_id = row[13].strip() if len(row) > 13 else ''

    if (statut != 'Ignorer' and pm == 'Les deux'
            and presence not in ('Aucun', '')
            and lu_id and cp_id):
        lu_to_cp[lu_id] = cp_id
        lu_to_row[lu_id] = i

print(f"Items to process: {len(lu_to_cp)}")

# Group by pathology
patho_dir = os.path.join(SANDBOX_BASE, 'Pathologies')
patho_changes = defaultdict(list)
lu_patho_slugs = defaultdict(list)

for f in glob.glob(os.path.join(patho_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    fd = d.get('fieldData', {})
    liens = fd.get('liens-utile', [])
    patho_slug = fd.get('slug', '')

    for lu_id, cp_id in lu_to_cp.items():
        if lu_id in liens:
            patho_changes[f].append((lu_id, cp_id))
            lu_patho_slugs[lu_id].append(patho_slug)

# Execute
total = 0
for filepath, changes in patho_changes.items():
    with open(filepath) as fh:
        d = json.load(fh)

    fd = d['fieldData']
    reco = fd.get('recommandations-2', [])
    patho_name = fd.get('name', '')

    for lu_id, cp_id in changes:
        if cp_id not in reco:
            reco.append(cp_id)
        total += 1
        if DRY_RUN:
            print(f"  {patho_name}: KEEP LU, ADD CP {cp_id}")

    fd['recommandations-2'] = reco

    if not DRY_RUN:
        with open(filepath, 'w') as fh:
            json.dump(d, fh, indent=2, ensure_ascii=False)

print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Total: {total} additions across {len(patho_changes)} pathologies")

# Update column P
if not DRY_RUN:
    cells = []
    for lu_id, patho_slugs in lu_patho_slugs.items():
        row_num = lu_to_row.get(lu_id)
        if row_num:
            existing_p = data[row_num-1][15] if len(data[row_num-1]) > 15 else ''
            all_slugs = [s for s in existing_p.split('; ') if s] + patho_slugs
            all_slugs = list(dict.fromkeys(all_slugs))
            cells.append({'range': f'P{row_num}', 'values': [['; '.join(all_slugs)]]})

    if cells:
        ws.update('P1', [['Pathologie(s) swappée(s)']], value_input_option='RAW')
        ws.format('P1', {'textFormat': {'bold': True}})
        ws.batch_update(cells, value_input_option='RAW')
        print(f"Updated {len(cells)} rows in column P")

    print("\nRun: scratchmd files upload")
