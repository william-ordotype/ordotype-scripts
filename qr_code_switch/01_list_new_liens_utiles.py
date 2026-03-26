"""
Step 1: List all Sandbox Liens utiles created in the last N months.
Creates a new Google Sheet with: Date, Name, Slug, Item ID, Titre, Lien internet, Patient/Médecin.
"""
import json, glob, os, sys
from datetime import datetime, timezone, timedelta
from config import SANDBOX_BASE, PM_HASHES, get_gspread_client

MONTHS_BACK = int(sys.argv[1]) if len(sys.argv) > 1 else 12
SHARE_EMAIL = sys.argv[2] if len(sys.argv) > 2 else 'william@ordotype.fr'

lu_dir = os.path.join(SANDBOX_BASE, 'Liens utiles')
cutoff = datetime.now(timezone.utc) - timedelta(days=MONTHS_BACK * 30)

results = []
for f in glob.glob(os.path.join(lu_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    created = datetime.fromisoformat(d['createdOn'].replace('Z', '+00:00'))
    if created >= cutoff:
        fd = d.get('fieldData', {})
        pm_hash = fd.get('patient-medecin', '')
        results.append([
            created.strftime('%Y-%m-%d'),
            fd.get('name', ''),
            fd.get('slug', ''),
            d['id'],
            fd.get('titre-qui-apparait', ''),
            fd.get('lien-internet', ''),
            PM_HASHES.get(pm_hash, ''),
        ])

results.sort(key=lambda x: x[0])
print(f"Found {len(results)} Liens utiles created since {cutoff.strftime('%Y-%m-%d')}")

gc = get_gspread_client()
sh = gc.create(f'Liens utiles - QR code switch {datetime.now().strftime("%Y-%m-%d")}')
sh.share(SHARE_EMAIL, perm_type='user', role='writer')

ws = sh.sheet1
header = ['Date créé', 'Name', 'Slug', 'Item ID', 'Titre (apparait sur le site)', 'Lien internet', 'Patient/Médecin']
ws.update(values=[header] + results, range_name=f'A1:G{len(results)+1}', value_input_option='RAW')
ws.format('A1:G1', {'textFormat': {'bold': True}})

print(f"Created: {sh.url}")
print(f"Shared with: {SHARE_EMAIL}")
