# QR Code Switch — Liens utiles → Conseils patients

Quarterly process to convert Liens utiles into Conseils patients QR code items and update Pathologies references.

## Prerequisites

- Python 3 with: `gspread`, `google-auth`, `anthropic`, `python-dotenv`, `requests`
- `.env` file at project root with: `ANTHROPIC_API_KEY`, `NOTION_TOKEN`
- Google service account: `google-doc-generator@savvy-girder-423313-u6.iam.gserviceaccount.com`
- Scratch CLI (`scratchmd`) configured for workspace `wkb_FvpXmp0MDg`

## Scripts (run in order)

1. `01_list_new_liens_utiles.py` — List new Liens utiles and export to Google Sheet
2. `02_classify_and_check.py` — Add PDF check, CP sole QR, Patient/Médecin, Présence Pathologies
3. `03_generate_descriptions.py` — Generate E (description) and F (texte complet) via Claude API
4. `04_create_conseils_patients.py` — Create CP QR code JSON files in Sandbox
5. `05_swap_pathologies_patient.py` — Swap in Pathologies for Patient-only items (remove from liens-utile, add to recommandations-2, replace in html)
6. `06_add_pathologies_les_deux.py` — Add CP to recommandations-2 for "Les deux" items (keep liens-utile)

## After each script

Run `scratchmd files upload` then publish from the Scratch web UI.
