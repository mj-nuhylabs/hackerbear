"""ORD projections parquet → one flat table (backend/data/ord_flat.parquet).

읽는 곳은 `backend/data/ord/projections/` 하나다. ORD의 projections 아티팩트는 이미 평면화돼
있고(단위가 컬럼명에 접혀 있다: setpoint_kelvin, reaction_time_seconds), 분자 식별자도 `smiles`로
풀려 있다. 그래서 protobuf를 거치지 않는다 — 예전 버전은 reaction.proto의 FileDescriptorProto를
파싱해 data/*.parquet의 protobuf를 풀었는데, projections가 같은 2,428,291행을 그대로 담고 있어
그 경로는 통째로 불필요하다. (evidence/corpus.py도 같은 projections를 읽는다.)

여기서 나오는 값은 전부 레코드에 적힌 것이거나 그것으로 환산한 값이다. 없으면 None이다.

주의 — 반응 SMILES가 두 종류다:
  rxn_smiles           inputs의 REACTANT role 컴포넌트 + 원하는 생성물로 조립. **원자 매핑 없음.**
  rxn_smiles_reported  레코드의 반응 레벨 identifier. **97~99%가 원자 매핑을 달고 있다.**
후자를 키로 조인하거나 중복 제거할 거면 반드시 매핑을 먼저 떼야 한다.

usage: .venv/bin/python scripts/flatten_ord.py [--workers 10]
"""
import argparse
import glob
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
PROJECTIONS = ROOT / "backend/data/ord/projections"
OUT = ROOT / "backend/data/ord_flat.parquet"
# projections 파일 메타데이터에는 ord.source_dataset_id만 있고 사람이 읽는 이름이 없다.
# data/(protobuf)의 ord.name을 미리 뽑아둔 맵. 없으면 dataset_name이 None이 될 뿐 나머지는 그대로 동작한다.
NAMES = ROOT / "backend/data/ord/dataset_names.json"

COLUMNS = ["reaction_id", "smiles", "inputs", "conditions", "outcomes", "provenance"]


def _items(m):
    """projections의 map 컬럼은 to_pylist()에서 [(key, value), ...] 또는 dict로 나온다."""
    if m is None:
        return []
    return list(m.items()) if isinstance(m, dict) else list(m)


def _row(r: dict) -> dict:
    by_role: dict[str, list[str]] = {}
    missing_reactant_smiles = False
    for _, inp in _items(r.get("inputs")):
        for c in (inp or {}).get("components") or []:
            role = c.get("reaction_role") or "UNSPECIFIED"
            s = c.get("smiles")
            if not s and role == "REACTANT":
                missing_reactant_smiles = True
            if s:
                by_role.setdefault(role, []).append(s)

    product = yield_pct = time_h = None
    for o in r.get("outcomes") or []:
        prods = o.get("products") or []
        desired = ([p for p in prods if p.get("is_desired_product")]
                   or [p for p in prods if p.get("reaction_role") == "PRODUCT"] or prods)
        for p in desired[:1]:
            product = p.get("smiles")
            for m in p.get("measurements") or []:
                if m.get("type") == "YIELD" and (m.get("percentage") or {}).get("value") is not None:
                    yield_pct = m["percentage"]["value"]
                    break
        if o.get("reaction_time_seconds") is not None:
            time_h = o["reaction_time_seconds"] / 3600.0
        if product:
            break

    reactants = by_role.get("REACTANT", [])
    rxn = (".".join(reactants) + ">>" + product) if reactants and product and not missing_reactant_smiles else None

    cond = r.get("conditions") or {}
    k = ((cond.get("temperature") or {}).get("setpoint_kelvin"))
    pv = r.get("provenance") or {}
    return {
        "reaction_id": r.get("reaction_id"),
        "rxn_smiles": rxn,                       # REACTANT role로 조립. 원자 매핑 없음
        "rxn_smiles_reported": r.get("smiles"),  # 반응 레벨 identifier. 대부분 원자 매핑 있음
        "reactants": ".".join(reactants) or None,
        "reagents": ".".join(by_role.get("REAGENT", [])) or None,
        "catalysts": ".".join(by_role.get("CATALYST", [])) or None,
        "solvents": ".".join(by_role.get("SOLVENT", [])) or None,
        "product": product,
        "yield_pct": yield_pct,
        "temperature_c": (k - 273.15) if k is not None else None,
        "time_h": time_h,
        "patent": pv.get("patent") or None,
        "doi": pv.get("doi") or None,
        "publication_url": pv.get("publication_url") or None,
        "organization": ((pv.get("experimenter") or {}).get("organization")) or None,
        "is_mined": pv.get("is_mined"),
    }


_names: dict[str, str] | None = None


def dataset_names() -> dict[str, str]:
    global _names
    if _names is None:
        import json
        _names = json.loads(NAMES.read_text()) if NAMES.exists() else {}
    return _names


def flatten_file(path: str) -> pd.DataFrame:
    meta = {k.decode(): v.decode() for k, v in (pq.read_metadata(path).metadata or {}).items()
            if k.startswith(b"ord.")}
    ds_id = meta.get("ord.source_dataset_id") or meta.get("ord.dataset_id")
    rows = [_row(r) for r in pq.read_table(path, columns=COLUMNS).to_pylist()]
    df = pd.DataFrame(rows)
    df.insert(0, "dataset_id", ds_id)
    df.insert(1, "dataset_name", dataset_names().get(ds_id))
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    files = sorted(glob.glob(str(PROJECTIONS / "*/*.parquet")))
    if not files:
        raise SystemExit(f"no projections under {PROJECTIONS}")
    with ProcessPoolExecutor(a.workers) as ex:
        dfs = []
        for i, df in enumerate(ex.map(flatten_file, files), 1):
            dfs.append(df)
            print(f"[{i}/{len(files)}] {df.dataset_name.iat[0] if len(df) else '?'}: {len(df)}", flush=True)
    out = pd.concat(dfs, ignore_index=True)
    out.to_parquet(a.out, index=False)
    print(f"wrote {a.out} rows={len(out)}")


if __name__ == "__main__":
    main()
