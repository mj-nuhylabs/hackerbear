"""backend/data/prices.csv 생성 — 빌딩블록 가격 스냅샷.

**여기서 나오는 가격은 실제 공급사 가격이 아니다.** 실시간 공급사 API는 범위 밖이라
(CLAUDE_HACKFNM.md) 모든 행이 `is_mock=true`로 나간다. cost/prices.py가 그 플래그를
BOM 줄까지 전달하고, UI가 배지를 붙인다. 계산 자체는 진짜고 가정값은 가격뿐이다.

실제 가격을 확보하면 같은 스키마로 행을 바꾸고 is_mock=false, as_of_date를 갱신한다.

가격 값은 demo.json이 쓰던 것과 **같은 해시 레시피**다(scripts/make_mock_data.py의 mock_price).
목업 UI와 실제 백엔드가 같은 숫자를 보여주도록 맞춘 것이다.

usage: .venv/bin/python scripts/make_prices.py
"""
import csv
import hashlib
import json
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "frontend/src/mock/demo.json"
OUT = ROOT / "backend/data/prices.csv"
AS_OF = "2026-11-01"

# 데모 밖 타겟에서도 BOM이 비지 않도록 넣어 두는 흔한 빌딩블록
COMMON = {
    "CC(=O)OC(C)=O": "Acetic anhydride", "O=C(O)c1ccccc1O": "Salicylic acid",
    "CC(=O)Cl": "Acetyl chloride", "CC(=O)O": "Acetic acid",
    "O=C(O)c1ccccc1F": "2-Fluorobenzoic acid", "OCc1ccccc1": "Benzyl alcohol",
    "O=C(OCc1ccccc1)c1ccccc1O": "Benzyl salicylate", "CCO": "Ethanol",
    "CO": "Methanol", "ClCCl": "Dichloromethane", "CC#N": "Acetonitrile",
    "c1ccncc1": "Pyridine", "CCN(CC)CC": "Triethylamine", "O": "Water",
    "CC(C)(C)OC(=O)OC(=O)OC(C)(C)C": "Boc anhydride", "CS(=O)(=O)Cl": "Methanesulfonyl chloride",
}


def h(s: str) -> int:
    return int(hashlib.sha1(s.encode()).hexdigest(), 16)


def mock_price(smiles: str) -> dict:
    """scripts/make_mock_data.py의 mock_price와 같은 레시피 — 목업과 숫자를 맞춘다."""
    x = h(smiles)
    pack = [5, 25, 100, 500][x % 4]
    per_g = round(0.4 + (x % 3800) / 100, 2)          # 0.4–38.4 USD/g
    discount = [1.0, 0.7, 0.5, 0.35][x % 4]
    return {"price_per_g": per_g, "pack_size_g": pack,
            "pack_price": round(per_g * pack * discount, 2)}


def canon(s: str) -> str | None:
    m = Chem.MolFromSmiles(s)
    return Chem.MolToSmiles(m) if m else None


def main():
    wanted: dict[str, str | None] = {}

    if DEMO.exists():
        demo = json.loads(DEMO.read_text())
        for smi in demo.get("prices", {}):
            if (c := canon(smi)):
                wanted.setdefault(c, (demo.get("compounds", {}).get(smi) or {}).get("name"))
        for t in demo.get("targets", []):
            for r in t.get("routes", []):
                for leaf in r.get("leaf_materials", []):
                    if (c := canon(leaf["smiles"])):
                        wanted.setdefault(c, leaf.get("name"))
    for smi, name in COMMON.items():
        if (c := canon(smi)):
            wanted.setdefault(c, name)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["smiles", "name", "price_per_g", "pack_size_g", "pack_price",
            "currency", "supplier", "as_of_date", "is_mock"]
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for smi in sorted(wanted):
            w.writerow({"smiles": smi, "name": wanted[smi] or "", **mock_price(smi),
                        "currency": "USD", "supplier": "Example supplier",
                        "as_of_date": AS_OF, "is_mock": "true"})
    print(f"wrote {OUT.relative_to(ROOT)}: {len(wanted)} building blocks, all is_mock=true")


if __name__ == "__main__":
    main()
