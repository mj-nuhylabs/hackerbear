"""데모 경로의 각 스텝에 ORD 실험 절차를 붙인다.

ORD projections를 훑어 스텝 생성물과 같은 화합물을 만드는 레코드를 찾고, 반응물 집합이 얼마나 맞는지로
등급을 매겨 demo.json에 넣는다. 붙는 값은 전부 레코드에 적힌 것이거나 그것으로 계산한 것이다.
맞는 레코드가 없으면 아무것도 넣지 않는다 — UI는 "코퍼스에 선례 없음"으로 띄운다.

사용: .venv/bin/python -I scripts/attach_procedures.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from evidence.corpus import PROJECTIONS, REPORTED_MATCHES, best_match, scan  # noqa: E402

DEMO = ROOT / "frontend/src/mock/demo.json"
CACHE = ROOT / "backend/data/ord_hits.json"


def wanted_products(demo: dict) -> set[str]:
    out = set()
    for t in demo["targets"]:
        for r in t["routes"]:
            for s in r["steps"]:
                out.add(s["product"]["smiles"])
    return out


def main():
    demo = json.loads(DEMO.read_text())
    wanted = wanted_products(demo)
    print(f"{len(wanted)} distinct step products to look for")

    # 캐시는 "찾아본 생성물 목록"까지 들고 있어야 한다. 경로가 바뀌어 새 생성물이 생겼는데
    # 캐시만 믿으면 그 스텝은 영영 절차가 안 붙는다.
    cached = json.loads(CACHE.read_text()) if CACHE.exists() else None
    if cached is not None and set(cached.get("looked_for", [])) >= wanted:
        hits = cached["records"]
        print(f"loaded {sum(len(v) for v in hits.values())} cached records from {CACHE.name}")
    else:
        if cached is not None:
            missing = wanted - set(cached.get("looked_for", []))
            print(f"cache misses {len(missing)} new products — rescanning")
        def progress(n, total, seen, found):
            print(f"  [{n:>2}/{total}] {seen:,} reactions read, {found} matching records", flush=True)

        procs = scan(wanted, PROJECTIONS, progress)
        hits = {k: [p.to_json() for p in v] for k, v in procs.items()}
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({"looked_for": sorted(wanted), "records": hits}, ensure_ascii=False))
        print(f"wrote {CACHE.relative_to(ROOT)}")

    # dict를 Procedure처럼 다루기 위한 얇은 래퍼
    class P(dict):
        __getattr__ = dict.get

    attached = 0
    for t in demo["targets"]:
        for r in t["routes"]:
            for s in r["steps"]:
                cands = [P(x) for x in hits.get(s["product"]["smiles"], [])]
                if not cands:
                    continue
                reactants = {x["smiles"] for x in s["reactants"]}
                best, kind = best_match(cands, reactants)
                if not best:
                    continue
                s["procedure"] = {**best, "match": kind}
                attached += 1
                if kind not in REPORTED_MATCHES:
                    continue

                # 생성물이 같고 스텝 반응물이 레코드에 다 들어 있다 = 스펙의 REPORTED 조건.
                # 여기서부터 붙는 값은 추정이 아니라 레코드값이므로 example 표시를 떼어낸다.
                ev = s["evidence"]
                ev["tier"] = "REPORTED"
                ev["source_ids"] = [best["reaction_id"]]
                ev["url"] = best.get("url")
                ev["mock"] = [m for m in ev.get("mock", []) if m not in ("tier", "source_ids")]

                if best.get("yield_pct") is not None:
                    s["reported_yield"] = round(best["yield_pct"] / 100, 3)

                rg = best.get("reagents") or []
                by_role = lambda role: next((r for r in rg if (r.get("role") or "") == role), None)  # noqa: E731
                # ORD의 inputs 키는 사람이 붙인 역할명일 때도 있고 기계가 만든 것일 때도 있다
                # (m1_m5_m2_m3_m4_m6 같은). 화합물명이 있으면 그걸 쓴다.
                named = lambda r: (r.get("name") or r.get("label")) if r else None  # noqa: E731
                solvent, cat = by_role("SOLVENT"), by_role("CATALYST")
                cond = {
                    "solvent": named(solvent),
                    "temperature_c": best.get("temperature_c"),
                    "time_h": best.get("time_h"),
                    "catalyst": named(cat),
                    "catalyst_loading": cat.get("equiv") if cat else None,
                    "source_id": best["reaction_id"],
                }
                if any(cond[k] is not None for k in ("solvent", "temperature_c", "time_h", "catalyst")):
                    s["conditions"] = cond  # mock 플래그 없음 — 전부 레코드값
                s["mock"] = [m for m in s.get("mock", []) if m not in ("reported_yield", "conditions")]

    DEMO.write_text(json.dumps(demo, ensure_ascii=False, indent=1))
    total = sum(len(r["steps"]) for t in demo["targets"] for r in t["routes"])
    print(f"attached a procedure to {attached} of {total} steps")
    for t in demo["targets"]:
        got = [
            s["procedure"]["match"]
            for r in t["routes"] for s in r["steps"] if "procedure" in s
        ]
        print(f"  {t['name']:14s} {len(got):3d} steps with a record  {dict((k, got.count(k)) for k in set(got))}")


if __name__ == "__main__":
    main()
