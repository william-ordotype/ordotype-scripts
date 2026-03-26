"""
Step 3: Generate descriptions (col E) and full text (col F) via Claude API.
Only fills rows where E is empty.

Usage: python 03_generate_descriptions.py <sheet_key> [gid]
"""
import json, os, sys, re, time, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import get_gspread_client, get_anthropic_client

SHEET_KEY = sys.argv[1]
GID = int(sys.argv[2]) if len(sys.argv) > 2 else 0

gc = get_gspread_client()
sh = gc.open_by_key(SHEET_KEY)
ws = sh.get_worksheet_by_id(GID)
data = ws.get_all_values()

# Find rows with empty E
to_generate = []
for i, row in enumerate(data[1:], 2):
    if not row[4].strip():
        to_generate.append({
            'row': i,
            'name': row[1],
            'url': row[3] if len(row) > 3 else '',
            'is_pdf': row[7] if len(row) > 7 else '',
        })

print(f"Rows to generate: {len(to_generate)}")
if not to_generate:
    print("Nothing to do")
    sys.exit(0)

# Fetch URL content
def fetch_content(item):
    url = item['url']
    if not url:
        return item, ''
    try:
        r = requests.get(url, timeout=15, allow_redirects=True, stream=True,
                        headers={'User-Agent': 'Mozilla/5.0'})
        ct = r.headers.get('Content-Type', '')
        if 'pdf' in ct:
            return item, '[PDF document]'
        content = r.text[:5000]
        title_match = re.search(r'<title[^>]*>(.*?)</title>', content, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else ''
        text = re.sub(r'<[^>]+>', ' ', content)
        text = re.sub(r'\s+', ' ', text).strip()[:2000]
        return item, f"Title: {title}\nContent: {text}"
    except Exception as e:
        return item, f'[Error: {str(e)[:100]}]'

print("Fetching URL content...")
contents = {}
with ThreadPoolExecutor(max_workers=15) as executor:
    futures = {executor.submit(fetch_content, item): item for item in to_generate}
    for i, future in enumerate(as_completed(futures), 1):
        item, content = future.result()
        contents[item['row']] = content
        if i % 50 == 0:
            print(f"  {i}/{len(to_generate)} fetched")
print(f"  {len(to_generate)}/{len(to_generate)} fetched")

# Generate via Claude
EXAMPLES = """Exemples existants:
- Name: "3114, numéro national de prévention du suicide - Site" → E: "un numéro national d'aide et des ressources et conseils en prévention du suicide" → F: "Scannez le QR Code pour accéder à un numéro national d'aide et des ressources et conseils en prévention du suicide."
- Name: "50 astuces pour manger mieux et bouger plus - PDF" → E: "une brochure PDF présentant 50 conseils pour mieux manger et bouger" → F: "Scannez le QR Code pour accéder à 50 conseils pour mieux manger et bouger."
- Name: "Activ'Dos sur App Store - Appli mobile" → E: "l'application Activ'Dos proposant des exercices adaptés pour soulager le mal de dos" → F: "Scannez le QR Code pour accéder à l'application Activ'Dos via App Store proposant des exercices adaptés pour soulager le mal de dos."
- Name: "Activité physique et HTA - PDF" → E: "une fiche d'information sur l'activité physique adaptée pour la gestion de l'HTA" → F: "Scannez le QR Code pour accéder à une information sur l'activité physique adaptée à l'hypertension artérielle."
"""

client = get_anthropic_client()
results = {}
batch_size = 20

for batch_start in range(0, len(to_generate), batch_size):
    batch = to_generate[batch_start:batch_start + batch_size]

    items_text = ""
    for item in batch:
        content_preview = contents.get(item['row'], '')[:500]
        items_text += f"\n---\nRow: {item['row']}\nName: {item['name']}\nURL: {item['url']}\nPDF: {item['is_pdf']}\nContent: {content_preview}\n"

    prompt = f"""{EXAMPLES}

Génère E (Description Générée) et F (Texte Complet) pour chaque item ci-dessous.

Règles:
- E commence par un article minuscule (un/une/l'/le/la/les/des) et décrit brièvement la ressource (1 phrase courte)
- F commence TOUJOURS par "Scannez le QR Code pour accéder à" suivi d'une reformulation de E
- F se termine par un point
- Pas de guillemets ni de markdown
- Langue: français
- Si PDF, mentionner que c'est un document/fiche/brochure PDF dans E

Réponds UNIQUEMENT en JSON: {{"results": [{{"row": "...", "E": "...", "F": "..."}}]}}

Items:{items_text}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            for r in parsed['results']:
                results[r['row']] = {'E': r['E'], 'F': r['F']}
    except Exception as e:
        print(f"  Error at batch {batch_start}: {e}")

    done = min(batch_start + batch_size, len(to_generate))
    print(f"  {done}/{len(to_generate)} generated")
    time.sleep(0.5)

print(f"Generated: {len(results)} descriptions")

# Write to sheet
cells = []
for row_num, gen in results.items():
    cells.append({'range': f'E{row_num}', 'values': [[gen['E']]]})
    cells.append({'range': f'F{row_num}', 'values': [[gen['F']]]})

for i in range(0, len(cells), 500):
    ws.batch_update(cells[i:i+500], value_input_option='RAW')

print(f"Written {len(results)} rows to columns E and F")
