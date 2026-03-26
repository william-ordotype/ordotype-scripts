"""
Step 4: Create Conseils patients QR code JSON files from the Google Sheet.
Reads the sheet, applies a filter (Statut != Ignorer), and creates CP files.

Usage: python 04_create_conseils_patients.py <sheet_key> [gid]
"""
import json, glob, os, sys, re, unicodedata
from config import SANDBOX_BASE, get_gspread_client

SHEET_KEY = sys.argv[1]
GID = int(sys.argv[2]) if len(sys.argv) > 2 else 0


def slugify(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')


# Read sheet
gc = get_gspread_client()
sh = gc.open_by_key(SHEET_KEY)
ws = sh.get_worksheet_by_id(GID)
data = ws.get_all_values()

# Build LU ID -> titre-qui-apparait
lu_dir = os.path.join(SANDBOX_BASE, 'Liens utiles')
id_to_titre = {}
for f in glob.glob(os.path.join(lu_dir, '*.json')):
    with open(f) as fh:
        d = json.load(fh)
    id_to_titre[d['id']] = d.get('fieldData', {}).get('titre-qui-apparait', '')

# Filter: skip rows where Statut (col G, idx 6) = "Ignorer"
filtered = []
for row in data[1:]:
    statut = row[6] if len(row) > 6 else ''
    if statut != 'Ignorer':
        filtered.append(row)

print(f"Items to process: {len(filtered)}")

# Create CP files
cp_dir = os.path.join(SANDBOX_BASE, 'Conseils patients')
created = 0
skipped = 0
collisions = []

for row in filtered:
    item_id = row[0].strip()
    col_f = row[5].strip()
    titre = id_to_titre.get(item_id, '')

    if not titre or not col_f:
        continue

    name = f"{titre} - QR code"
    slug = slugify(name)
    filepath = os.path.join(cp_dir, f"{slug}.json")

    if os.path.exists(filepath):
        collisions.append((item_id, slug, row[1]))
        skipped += 1
        continue

    cp = {
        "isDraft": False,
        "isArchived": False,
        "fieldData": {
            "name": name,
            "slug": slug,
            "titre-a-impression": titre,
            "html": f'<p id="">&lt;p&gt;{col_f}&lt;/p&gt;</p>',
            "qr-codes": [item_id],
            "pdf-du-cp-ok": False,
            "pdf-a-ne-pas-generer-2": False,
            "fcp-a-envoyer-a-la-traduction": False,
        }
    }

    with open(filepath, 'w') as fh:
        json.dump(cp, fh, indent=2, ensure_ascii=False)
    created += 1

print(f"Created: {created}")
print(f"Skipped (slug collision): {skipped}")
if collisions:
    print("\nCollisions (need manual suffix like -pdf, -site, -ameli):")
    for item_id, slug, name in collisions:
        print(f"  {item_id} | {name} | slug: {slug}")

print("\nRun: scratchmd files upload")
