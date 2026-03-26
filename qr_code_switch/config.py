import os
from dotenv import load_dotenv

# Load .env from project root
ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(ENV_PATH)

SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'service-account-file.json')

SANDBOX_BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'Ordotype', 'Ordotype', 'WEBFLOW - Sandbox ', 'Sandbox Ordotype')
PROD_BASE = os.path.join(os.path.dirname(__file__), '..', '..', 'Ordotype', 'Ordotype', 'WEBFLOW - Webflow', 'Ordotype')

# Webflow Option hashes for patient-medecin (Sandbox)
PM_HASHES = {
    '97614fb23ac1184706f8cf51976cb1cb': 'Patient',
    '03ea71dffb3eb220de7fe6b9401de936': 'Médecin',
    'dd747e6ea027bb67893e139feb1982e0': 'Les deux',
}
PM_LABELS = {v: k for k, v in PM_HASHES.items()}


def get_gspread_client(readonly=False):
    import gspread
    from google.oauth2.service_account import Credentials
    scopes = ['https://www.googleapis.com/auth/spreadsheets' + ('.readonly' if readonly else '')]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    return gspread.authorize(creds)


def get_anthropic_client():
    import anthropic
    return anthropic.Anthropic()
