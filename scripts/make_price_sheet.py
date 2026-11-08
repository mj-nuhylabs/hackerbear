"""가격을 손으로 채울 시트를 만든다 — 데모가 실제로 사는 물질만.

가격은 자동으로 못 긁는다. 공급사 사이트는 스크립트를 막거나(403) 로그인을 요구하거나
가격을 의도적으로 가린다. 공개된 ASKCOS buyables는 값이 진짜가 아니다 (정수뿐이고
$100/g에서 잘리며, 아세트산이 $99/g이다). 그래서 사람이 공급사 페이지를 열고 읽는다.

이 스크립트가 채우는 칸은 전부 계산값이거나 PubChem 응답 그대로다:
    smiles(RDKit 정규화), name·cas(PubChem), mw(RDKit), used_in(어느 타겟이 쓰는지)
비워 두는 칸은 사람이 공급사 페이지에서 읽어 적는다:
    price_per_g, pack_size_g, pack_price, supplier, catalog_no, url

catalog_no와 url을 같이 받는 이유는 절대 규칙 2다 — UI에 뜨는 모든 숫자는 출처가 있어야
한다. 가격만 적으면 그 숫자는 출처가 없다.

    .venv/bin/python -I scripts/make_price_sheet.py [--targets imatinib lidocaine aspirin]

backend/data/prices_to_fill.csv를 쓴다. 채운 뒤 scripts/import_prices.py로 넣는다.
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

# 데모에서 돌릴 타겟 — 홈 화면에 뜨는 다섯 개 전부. 하나라도 빠지면 그 타겟의 BOM이 가격 없이 뜬다
DEFAULT_TARGETS = ["imatinib", "lidocaine", "aspirin", "caffeine", "osimertinib"]

# /routes가 데모 타겟에 돌려주는 미리 계산된 페이로드 (chem/routes.py _demo_payload).
# 있으면 그걸 읽는다 — 데모가 실제로 보여주는 경로가 바로 이것이다
DEEP = ROOT / "backend/data/deep"

COLUMNS = [
    # 여기까지는 채워서 나간다
    "smiles", "name", "cas", "mw", "used_in",
    # 여기부터는 사람이 공급사 페이지를 보고 적는다
    "price_per_g", "pack_size_g", "pack_price", "currency", "supplier", "catalog_no", "url",
    # 찾아가기 편하라고 넣는 CAS 검색 링크. 출처가 아니다 — 출처는 위의 url이다.
    # 다른 공급사를 써도 되고, 실제로 가격을 읽은 페이지 주소를 url에 적으면 된다
    "lookup",
]

# CAS로 검색하는 주소. 가격을 주장하지 않는다. 검색 결과 페이지일 뿐이다
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
    """SMILES → (이름, CAS). PubChem 응답 그대로다. 못 찾으면 (None, None) — 지어내지 않는다.

    SMILES에는 URL에서 깨지는 문자가 있으므로 POST 본문으로 보낸다.
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
    time.sleep(0.25)                      # PubChem은 초당 5건까지다
    s = _post("synonyms")
    if s:
        try:
            syns = s["InformationList"]["Information"][0].get("Synonym", [])
            cas = next((x for x in syns if CAS_RE.fullmatch(x)), None)
        except (KeyError, IndexError):
            pass
    return name, cas


def leaves_for(target: str) -> dict[str, dict]:
    """타겟 이름 → {smiles: 말단 물질}. 데모 페이로드가 있으면 그것, 없으면 실제 /resolve·/routes 응답."""
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
        # 타겟 자체도 넣는다. 완성품을 사는 게 만드는 것보다 싸면 /cost가 그렇다고 말해야 한다
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
