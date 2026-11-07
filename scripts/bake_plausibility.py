"""demo.json의 타당성 점수를 실제 모델 출력으로 바꾼다.

목업 단계에서 demo.json의 plausibility_raw/calibrated는 내가 만든 가짜 값이었고
(`mock` 리스트에 그렇게 표시해 뒀다), UI는 그 옆에 `example` 배지를 띄웠다.
학습이 끝났으니 model/predict.py가 내는 실제 값으로 덮고 배지를 뗀다.

점수를 바꾸면 등급도 따라 바뀐다 — evidence/tiers.py의 PLAUSIBILITY_MIN이 0.5 미만을
COMPUTED로 내리기 때문이다. 그래서 점수만 쓰고 등급을 그대로 두면 화면의 배지와 숫자가
어긋난다. decide()를 다시 돌려 둘을 맞춘다.

REPORTED는 점수와 무관하게 유지된다(코퍼스에 레코드가 있다는 사실이 점수보다 강한 증거다).
점수가 None으로 오면(정규화 실패) None을 그대로 쓴다. 가짜 값을 남겨 두지 않는다 —
"없음"을 "낮음"으로 바꿔 읽지 않기 위해서다(절대 규칙 3).

    python scripts/bake_plausibility.py --dry-run     # 무엇이 바뀌는지만 본다
    python scripts/bake_plausibility.py               # 실제로 쓴다
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from evidence.tiers import decide  # noqa: E402
from model.predict import score_many  # noqa: E402

DEMO = ROOT / "frontend/src/mock/demo.json"
BAKED = ("plausibility_raw", "plausibility_calibrated")


def steps_of(demo: dict):
    """(타겟명, 경로 id, 스텝 인덱스, 스텝) — 원본 dict를 그대로 내보내 제자리에서 고친다."""
    for t in demo["targets"]:
        for r in t["routes"]:
            for i, s in enumerate(r["steps"]):
                yield t["name"], r["id"], i, s


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    demo = json.loads(DEMO.read_text())
    rows = list(steps_of(demo))
    print(f"{DEMO.relative_to(ROOT)}: {len(rows)} steps")

    scores = score_many([s["rxn_smiles"] for _, _, _, s in rows])
    if len(scores) != len(rows):
        print(f"score_many returned {len(scores)} for {len(rows)} steps", file=sys.stderr)
        return 1

    moved, unscored = [], []
    tiers_before = Counter(s["evidence"]["tier"] for _, _, _, s in rows)

    for (name, rid, i, s), (raw, cal) in zip(rows, scores):
        before = s["evidence"]["tier"]
        if cal is None:
            unscored.append(f"{name} {rid} step{i}")

        s["plausibility_raw"] = raw
        s["plausibility_calibrated"] = cal

        # 실제 값이 됐으므로 example 배지를 뗀다. gaps 등 다른 mock 표시는 그대로 둔다.
        if s.get("mock"):
            s["mock"] = [k for k in s["mock"] if k not in BAKED]
            if not s["mock"]:
                del s["mock"]

        # 코퍼스 레코드가 있는지는 source_ids로 판정한다 — provenance가 채우는 것과 같은 기준.
        after = decide(
            has_corpus_record=bool(s["evidence"].get("source_ids")),
            precedent_count=s["evidence"]["precedent_count"],
            plausibility_calibrated=cal,
        )
        if after != before:
            s["evidence"]["tier"] = after
            moved.append((name, rid, i, before, after, s["evidence"]["precedent_count"], cal))

    cals = [c for _, c in scores if c is not None]
    print(f"\ncalibrated: {min(cals):.3f}–{max(cals):.3f}, {len(set(round(c, 6) for c in cals))} distinct")
    if unscored:
        print(f"no score ({len(unscored)}), left as null: {', '.join(unscored)}")

    print(f"\ntier changes: {len(moved)}")
    for name, rid, i, before, after, prec, cal in moved:
        print(f"  {name:<12} {rid:<4} step{i}  {before} → {after}   precedents={prec:<7} cal={cal:.3f}")

    tiers_after = Counter(s["evidence"]["tier"] for _, _, _, s in rows)
    print(f"\nbefore: {dict(tiers_before)}\nafter:  {dict(tiers_after)}")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return 0

    DEMO.write_text(json.dumps(demo, ensure_ascii=False, indent=2) + "\n")
    print(f"\nwrote {DEMO.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
