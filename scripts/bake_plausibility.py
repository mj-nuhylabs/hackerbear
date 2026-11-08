"""Replace the plausibility scores in demo.json with real model output.

During the mockup stage, plausibility_raw/calibrated in demo.json were fake values I made up
(listed in the `mock` list), and the UI showed an `example` badge next to them.
Training is done, so overwrite them with the real values from model/predict.py and drop the badge.

Changing the score changes the tier too: PLAUSIBILITY_MIN in evidence/tiers.py demotes anything below 0.5 to
COMPUTED. So if we wrote only the score and left the tier alone, the on-screen badge and number would
disagree. Re-run decide() to keep them consistent.

REPORTED is kept regardless of score (a record in the corpus is stronger evidence than a score).
If the score comes back None (normalization failed), write None as is. No fake value is left behind,
so that "missing" is never read as "low" (absolute rule 3).

    python scripts/bake_plausibility.py --dry-run     # only show what would change
    python scripts/bake_plausibility.py               # actually write
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
    """(target name, route id, step index, step) — yields the original dicts so they can be edited in place."""
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

        # These are real values now, so drop the example badge. Other mock markers such as gaps stay as they are.
        if s.get("mock"):
            s["mock"] = [k for k in s["mock"] if k not in BAKED]
            if not s["mock"]:
                del s["mock"]

        # Whether a corpus record exists is decided by source_ids, the same criterion provenance fills.
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
