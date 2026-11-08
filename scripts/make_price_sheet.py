"""Build a sheet for filling in prices by hand, only for the materials the demo actually buys.

Prices cannot be scraped automatically. Supplier sites block scripts (403), require login, or
deliberately hide prices. The public ASKCOS buyables values are not real (integers only,
capped at $100/g, with acetic acid at $99/g). So a person opens the supplier page and reads it.

Every cell this script fills is either computed or exactly as PubChem returned it:
    smiles (RDKit-canonicalized), name and cas (PubChem), mw (RDKit), used_in (which targets use it)
The cells left empty are read from the supplier page and entered by a person:
    price_per_g, pack_size_g, pack_price, supplier, catalog_no, url

catalog_no and url are collected together because of absolute rule 2: every number shown in the UI must have
a source. A bare price has no source.

    .venv/bin/python -I scripts/make_price_sheet.py [--targets imatinib lidocaine aspirin]

Writes backend/data/prices_to_fill.csv. After filling it in, import with scripts/import_prices.py.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend/data/prices_to_fill.csv"
API = "http://localhost:8000"
PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound"
CAS_RE = re.compile(r"\d{2,7}-\d{2}-\d")

# Targets the demo runs: all five shown on the home screen. If even one is missing, that target's BOM shows without prices
DEFAULT_TARGETS = ["imatinib", "lidocaine", "aspirin", "caffeine", "osimertinib",
                   "s-phenyl thioformate"]

# Precomputed payload that /routes returns for demo targets (chem/routes.py _demo_payload).
# If present, read it: these are exactly the routes the demo shows
DEEP = ROOT / "backend/data/deep"

COLUMNS = [
    # Filled in before sending out up to here
    "smiles", "name", "cas", "mw", "used_in",
    # From here on a person fills these in from the supplier page
    "price_per_g", "pack_size_g", "pack_price", "currency", "supplier", "catalog_no", "url",
    # CAS search link, included for convenience. Not a source; the source is the url above.
    # Another supplier is fine too; just put the address of the page where the price was actually read in url
    "lookup",
]

# CAS search address. Does not claim a price. It is only a search results page
SEARCH = "https://www.sigmaaldrich.com/US/en/search/{cas}?focus=products&type=cas_number"


def log(m: str):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def post(path: str, body: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def pubchem_name_cas(smiles: str) -> tuple[str | None, str | None]:
    """SMILES -> (name, CAS). Exactly as PubChem returned it. If not found, (None, None); nothing is invented.

    SMILES contains characters that break in URLs, so send it in the POST body.
    """
    def _post(endpoint: str):
        data = urllib.parse.urlencode({"smiles": smiles}).encode()
        try:
            with urllib.request.urlopen(f"{PUBCHEM}/smiles/{endpoint}/JSON",
                                        data=data, timeout=25) as r:
                return json.load(r)
        except Exception:
            return None

    name = cas = None
    p = _post("property/Title")
    if p:
        try:
            name = p["PropertyTable"]["Properties"][0].get("Title")
        except (KeyError, IndexError):
            pass
    time.sleep(0.25)                      # PubChem allows at most 5 requests per second
    s = _post("synonyms")
    if s:
        try:
            syns = s["InformationList"]["Information"][0].get("Synonym", [])
            cas = next((x for x in syns if CAS_RE.fullmatch(x)), None)
        except (KeyError, IndexError):
            pass
    return name, cas


def leaves_for(target: str) -> dict[str, dict]:
    """Target name -> {smiles: leaf material}. Uses the demo payload if present, otherwise the real /resolve and /routes responses."""
    demo = DEEP / f"demo_{target.lower()}.json"
    if demo.exists():
        routes = json.loads(demo.read_text())
        log(f"  {target} → {demo.relative_to(ROOT)}")
    else:
        r = post("/resolve", {"query": target, "kind": "name"}, timeout=60)
        log(f"  {target} → {r['smiles']}")
        routes = post("/routes", {"smiles": r["smiles"], "max_depth": 4, "time_limit_s": 30})
    out = {}
    for route in routes["routes"]:
        for m in route["leaf_materials"]:
            out[m["smiles"]] = m
        # Include the target itself too. If buying the finished product is cheaper than making it, /cost should say so
        if route["steps"]:
            t = route["steps"][-1]["product"]
            out[t["smiles"]] = t
    log(f"  {len(routes['routes'])} routes, {len(out)} distinct materials to buy")
    return out


def main():
    global API
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", nargs="+", default=DEFAULT_TARGETS)
    ap.add_argument("--api", default=API)
    a = ap.parse_args()
    API = a.api

    try:
        urllib.request.urlopen(API + "/health", timeout=10).read()
    except Exception as e:
        raise SystemExit(f"The backend is not answering at {API} ({e}).\n"
                         "Start it:  cd backend && ../.venv/bin/uvicorn main:app --port 8000")

    materials: dict[str, dict] = {}
    used_in: dict[str, set[str]] = {}
    for t in a.targets:
        log(f"{t}:")
        for smi, m in leaves_for(t).items():
            materials[smi] = m
            used_in.setdefault(smi, set()).add(t)

    log(f"{len(materials)} distinct materials across {len(a.targets)} targets. Asking PubChem for names.")
    rows = []
    for i, (smi, m) in enumerate(sorted(materials.items(), key=lambda kv: -len(used_in[kv[0]])), 1):
        name, cas = pubchem_name_cas(smi)
        if not name:
            log(f"  {i:2}/{len(materials)}  no PubChem match, leaving the name blank: {smi}")
        rows.append({
            "smiles": smi,
            "name": name or "",
            "cas": cas or "",
            "mw": round(m["mw"], 2) if m.get("mw") else "",
            "used_in": " ".join(sorted(used_in[smi])),
            "price_per_g": "", "pack_size_g": "", "pack_price": "",
            "currency": "USD", "supplier": "", "catalog_no": "", "url": "",
            "lookup": SEARCH.format(cas=cas) if cas else "",
        })
        time.sleep(0.25)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    named = sum(1 for r in rows if r["name"])
    log(f"wrote {OUT.relative_to(ROOT)} — {len(rows)} rows, {named} with a name from PubChem")
    print("\nFill in: price_per_g, pack_size_g, pack_price, supplier, catalog_no, url")
    print("Leave a row blank if you cannot find it — a blank row stays unpriced and shows as —.")
    print("Then:  .venv/bin/python -I scripts/import_prices.py")


if __name__ == "__main__":
    sys.exit(main())
