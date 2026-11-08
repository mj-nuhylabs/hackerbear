"""Check every number a chemist would take to the bench, on every step now on screen.

Not a test suite — a report. It walks the shown routes of the five targets and flags anything a
chemist would query: a procedure that is not one, a record whose own figures disagree, a scale-up
factor that cannot be real, equivalents or conditions outside what a reaction does, and a
"your substrate" row paired to something it does not resemble.

    .venv/bin/python -I scripts/audit_procedures.py [--routes 3]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
DEEP = ROOT / "backend/data/deep"
TARGETS = ["aspirin", "caffeine", "lidocaine", "imatinib", "osimertinib"]

# Bounds that say "no reaction is run like this", not "this is unusual".
MAX_SCALE_FACTOR = 500        # record -> our scale; beyond this the record's amounts are suspect
MAX_EQUIV = 100               # solvent-as-reagent aside, 100 equivalents is not an equivalent
MIN_TEMP_C, MAX_TEMP_C = -120.0, 400.0
MAX_TIME_H = 720.0            # a month
MIN_PAIR_SIMILARITY = 0.25    # evidence/adapt.py's own floor for calling something "your substrate"


def flag(out, step_id, kind, msg):
    out.append({"step": step_id, "kind": kind, "msg": msg})


def audit(n_routes: int) -> list[dict]:
    from evidence.procedures import score as proc_score

    found: list[dict] = []
    seen = 0
    for t in TARGETS:
        d = json.loads((DEEP / f"demo_{t}.json").read_text())
        for r in d["routes"][:n_routes]:
            for i, s in enumerate(r["steps"], 1):
                seen += 1
                sid = f"{t}/{r['id']}/s{i}"
                p = s.get("procedure") or {}
                text = p.get("text")

                if text and not p.get("experimental"):
                    flag(found, sid, "not-a-procedure", p.get("not_experimental_reason") or "?")
                if p.get("amount_conflicts"):
                    for c in p["amount_conflicts"]:
                        flag(found, sid, "record-contradicts-itself",
                             f"{c['reagent']}: {c['stated_g']*1000:g} mg vs {c['stated_mol']*1000:g} mmol")

                # scale: what the record ran at against what this step needs
                was = p.get("limiting_recorded_mmol")
                tbl = next((x.get("table") for x in (s.get("recorded_records") or []) if x.get("table")), None)
                ours = None
                if tbl:
                    ours = tbl.get("scale_mmol")
                if was and was > 0 and ours:
                    k = ours / was
                    if k > MAX_SCALE_FACTOR or k < 1 / MAX_SCALE_FACTOR:
                        flag(found, sid, "implausible-scale", f"record {was:g} mmol -> table {ours:g} mmol (x{k:.0f})")

                for rec in (s.get("recorded_records") or [])[:3]:
                    y, temp, th = rec.get("yield_pct"), rec.get("temperature_c"), rec.get("time_h")
                    if y is not None and not (0 < y <= 100):
                        flag(found, sid, "yield-out-of-range", f"{rec['reaction_id']}: {y}%")
                    if temp is not None and not (MIN_TEMP_C <= temp <= MAX_TEMP_C):
                        flag(found, sid, "temperature-out-of-range", f"{rec['reaction_id']}: {temp} C")
                    if th is not None and not (0 < th <= MAX_TIME_H):
                        flag(found, sid, "time-out-of-range", f"{rec['reaction_id']}: {th} h")
                    for row in ((rec.get("table") or {}).get("rows") or []):
                        eq = row.get("equiv")
                        if eq is not None and (eq > MAX_EQUIV or eq <= 0):
                            flag(found, sid, "equivalents-out-of-range",
                                 f"{row.get('recorded_name') or row.get('our_smiles')}: {eq} equiv")
                        sim = row.get("pair_similarity")
                        if row.get("is_substrate") and sim is not None and sim < MIN_PAIR_SIMILARITY:
                            flag(found, sid, "weak-substrate-pairing",
                                 f"{row.get('recorded_name')}: Tanimoto {sim}")

                # the yield the cost engine used must come from somewhere real or be flagged assumed
                yb = (s.get("yield_basis") or {}).get("basis")
                if yb == "reported" and s.get("reported_yield") is None:
                    flag(found, sid, "yield-basis-mismatch", "basis says reported but no reported yield")
                if s.get("assumed_yield") is not None and not (0 < s["assumed_yield"] <= 1):
                    flag(found, sid, "yield-used-out-of-range", str(s["assumed_yield"]))
    print(f"checked {seen} steps on the top {n_routes} routes of {len(TARGETS)} targets")
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--routes", type=int, default=3)
    a = ap.parse_args()
    found = audit(a.routes)
    if not found:
        print("\nnothing flagged.")
        return 0
    from collections import Counter
    by = Counter(f["kind"] for f in found)
    print(f"\n{len(found)} flags:")
    for k, n in by.most_common():
        print(f"\n  {k}  ({n})")
        for f in [x for x in found if x["kind"] == k][:6]:
            print(f"     {f['step']:34s} {f['msg'][:92]}")
        if n > 6:
            print(f"     ... and {n - 6} more")
    return 0


if __name__ == "__main__":
    sys.exit(main())
