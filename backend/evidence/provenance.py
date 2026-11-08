"""Step -> source record reverse mapping.

The AiZynthFinder template table has no provenance (its only columns are retro_template, template_hash,
classification and library_occurence). Patent numbers cannot come from there, so we find the same
reaction on the ORD side and attach it. Reads data/ord_hits.json (product SMILES -> record list),
which scripts/attach_procedures.py pre-scraped.

Matching rule: same product, and the step's reactants must be a **subset** of the record's reactants.
Set equality gives 0 hits, because ORD writes salts, counterions and reagents on the left of the reaction.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

HITS = Path(__file__).resolve().parents[1] / "data/ord_hits.json"


def canon(smiles: str | None) -> str | None:
    if not smiles:
        return None
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(m)


@lru_cache(maxsize=1)
def _records() -> dict[str, list[dict]]:
    """Canonical product SMILES -> list of ORD records. Empty dict if the file is missing (feature off)."""
    if not HITS.exists():
        return {}
    raw = json.loads(HITS.read_text())
    out: dict[str, list[dict]] = {}
    for prod, recs in (raw.get("records") or {}).items():
        c = canon(prod)
        if c:
            out.setdefault(c, []).extend(recs)
    return out


def _completeness(r: dict) -> tuple:
    """Put records with conditions/yield first. More populated values are more useful in the UI."""
    return (r.get("yield_pct") is not None, r.get("temperature_c") is not None,
            r.get("time_h") is not None, bool(r.get("text")))


def match(reactants: list[str], product: str) -> list[dict]:
    """ORD records of the same reaction as this step. Empty list if none; we do not invent them."""
    p = canon(product)
    if not p:
        return []
    want = {c for c in (canon(r) for r in reactants) if c}
    if not want:
        return []
    hits = []
    for rec in _records().get(p, []):
        have = {c for c in (canon(r) for r in (rec.get("reactants") or [])) if c}
        # If the product is already among that record's reactants, the record did not form this bond:
        # it is a formulation, recrystallization or salt-exchange record (US05154930: aspirin dissolved in lecithin)
        if want <= have and p not in have:
            hits.append(rec)
    return sorted(hits, key=_completeness, reverse=True)


def procedure_from(records: list[dict], reactants: list[str]) -> dict | None:
    """One record for the procedure panel: the most complete one, verbatim. None if there is none.

    Only records that passed match() arrive here, so there are just two kinds: exact if the reactant sets are equal,
    covered if the record lists extra salts/reagents.
    """
    if not records:
        return None
    r = records[0]
    want = {c for c in (canon(x) for x in reactants) if c}
    have = {c for c in (canon(x) for x in (r.get("reactants") or [])) if c}
    return {**r, "match": "exact" if have == want else "covered"}


def evidence_from(records: list[dict], precedent_count: int, tier: str) -> dict:
    """Evidence block. source_ids and url come only from what the records contain."""
    return {
        "tier": tier,
        "source_ids": [r["reaction_id"] for r in records[:5] if r.get("reaction_id")],
        "precedent_count": precedent_count,
        "url": next((r["url"] for r in records if r.get("url")), None),
    }


def _catalyst(rec: dict) -> dict:
    """The catalyst as the record names it, and its structure only where the two agree.

    US07544831B2 names its catalyst "zirconia" and attaches a tetramethoxy diaryl oxane to it.
    Drawing that is worse than drawing nothing: the name is right and the structure is a
    resolver's mistake, so the name is kept and the structure dropped (evidence/identity.py).
    """
    from .identity import mismatch

    name = next((r.get("name") for r in ((rec.get("procedure") or {}).get("reagents") or [])
                 if (r.get("role") or "").upper() == "CATALYST" and r.get("name")), None)
    smiles = rec.get("catalysts") if isinstance(rec.get("catalysts"), str) else None
    why = mismatch(name, smiles)
    return {"catalyst": None if why else smiles, "catalyst_name": name,
            "catalyst_structure_dropped": why}


def conditions_from(records: list[dict]) -> dict | None:
    """Conditions for this reaction. Each item comes from the first record that lists it, with a per-item source.

    This used to return the first record with **any** temperature or time, whole. So when a record with only a
    temperature came first, the time showed as — even if a later record had one. Aspirin acetylation was
    that case: 6 records at 90-120 °C, 1 record with a time (5 min), and the time did not appear.

    Filling items separately means one screen's values can come from different experiments (different writeups of
    the same reaction).
    So each item carries a source_id and mixed=True is set: the UI must show the source next to the value.
    It must not pass off as the conditions of a single experiment.
    """
    fields = {"temperature_c": "temperature_c", "time_h": "time_h",
              "solvent": "solvents", "catalyst": "catalysts"}

    def read(r: dict) -> dict:
        return {k: (r.get(col) if col in r else r.get(k)) or None for k, col in fields.items()}

    def stated(r: dict) -> int:
        return sum(1 for v in read(r).values() if v is not None)

    def worked(r: dict) -> float:
        y = r.get("yield_pct")
        return float(y) if y is not None and 0 < y <= 100 else -1.0

    def lean(r: dict) -> float:
        """Negated solvent per mmol of substrate, so that less of it sorts first.

        A record that exists is not a record of the best way. US07842696B2 acetylates salicylic
        acid in 10 mL of dichloromethane per 0.72 mmol with 1.1 equivalents of pyridine, for 4
        hours, and gets 76% — which at a gram of aspirin is about 113 mL of dichloromethane before
        the extraction. The classic preparation uses the acetic anhydride as its own solvent, three
        drops of phosphoric acid and 15 minutes. They are not competing on how well they work; one
        is making aspirin and the other is acetylating something on the way to a different paper.
        How much material a run consumes per mmol is the part of that difference a record states.
        """
        t = r.get("table") or {}
        lim = t.get("limiting_recorded_mmol")
        if not lim:
            return 0.0
        # Only what the record calls a solvent. Counting every non-substrate volume made a
        # reactant charged by volume look like solvent burden, and the classic aspirin
        # preparation - whose acetic anhydride is both reagent and medium - lost to a record
        # that simply states no volumes at all.
        vol = sum((row.get("volume_ml") or 0.0) for row in (t.get("rows") or [])
                  if (row.get("role") or "").upper() == "SOLVENT")
        return -(vol * (t.get("scale_mmol") or 1.0) / lim)

    def timed(r: dict) -> int:
        """A procedure with no time cannot be run; one that states it can."""
        return 1 if read(r)["time_h"] is not None else 0

    # A reported yield comes first, then a stated time, then least material, then how much the
    # entry happens to carry.
    #
    # The yield leads because the cost engine is already using one. When the conditions came from a
    # record with no yield, the yield pushed through the route had to come from somewhere else, and
    # aspirin ended up with the quantities and temperature of a teaching-lab preparation that
    # reports no yield beside 76% taken from a patent nobody else on the sheet ran. That is two
    # experiments presented as one. Whatever record the sheet shows, the number the cost rests on
    # has to be that record's own, so a run that says what it gave is preferred to one that does
    # not — and the leaner run only wins among those that do.
    best = max(records, key=lambda r: (worked(r), timed(r), lean(r), stated(r))) if records else None
    if best is None or stated(best) == 0:
        return None
    out = {**read(best), "catalyst_loading": None,
           "source_id": best.get("reaction_id"), "mixed": False, **_catalyst(best)}

    # **Different** conditions written in other records are shown separately as alternatives. Merging item by item
    # would show four different experiments as one set of conditions. The aspirin step did this: solvent-free
    # 90 °C (zirconia) with 5 min got mixed with dichloromethane (ice-bath pyridine reaction), giving a procedure nobody ever ran.
    alts = []
    for r in records:
        if r is best or not r.get("reaction_id"):
            continue
        v = read(r)
        if stated(r) and any(v[k] is not None and v[k] != out[k] for k in fields):
            alts.append({**v, "source_id": r["reaction_id"],
                         "patent": r.get("patent"), "doi": r.get("doi")})
        if len(alts) >= 4:
            break
    out["alternatives"] = alts
    out["by_source"] = _by_source(records, read)
    return out


def _by_source(records: list[dict], read) -> list[dict]:
    """One row per patent or paper, not per record.

    Counting records lets a single patent's screening table drown out every other source. What a
    chemist wants from eleven records is how many independent groups ran this and what each of them
    did, so the sources are collapsed and each keeps the range it reports.
    """
    groups: dict[str, dict] = {}
    for r in records:
        key = (r.get("patent") or r.get("doi")
               or ((r.get("procedure") or {}).get("organization"))
               or r.get("dataset"))
        if not key:
            continue
        v = read(r)
        g = groups.setdefault(key, {"source": key, "records": 0, "temperatures": [], "times": [],
                                    "yields": [], "catalysts": set(), "solvents": set(),
                                    "url": r.get("url")})
        g["records"] += 1
        if v["temperature_c"] is not None:
            g["temperatures"].append(v["temperature_c"])
        if v["time_h"] is not None:
            g["times"].append(v["time_h"])
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            g["yields"].append(float(y))
        cat = next((x.get("name") for x in ((r.get("procedure") or {}).get("reagents") or [])
                    if (x.get("role") or "").upper() == "CATALYST" and x.get("name")), None)
        if cat:
            g["catalysts"].add(cat)
        if v["solvent"]:
            g["solvents"].add(str(v["solvent"]))
    out = []
    for g in groups.values():
        out.append({
            "source": g["source"], "url": g["url"], "records": g["records"],
            "temperature_c": _span(g["temperatures"]), "time_h": _span(g["times"]),
            "yield_pct": _span(g["yields"]),
            "catalysts": sorted(g["catalysts"]), "solvents": sorted(g["solvents"]),
        })
    # most informative source first: one that reports a yield, then one that reports conditions
    out.sort(key=lambda g: (g["yield_pct"] is not None, g["temperature_c"] is not None,
                            g["records"]), reverse=True)
    return out


def _span(vals: list[float]) -> dict | None:
    if not vals:
        return None
    return {"min": min(vals), "max": max(vals), "n": len(vals)}


def reported_yield(records: list[dict]) -> float | None:
    """Literature yield. Values outside 0 < y <= 100 are treated as record errors and dropped (37,578 in ORD)."""
    for r in records:
        y = r.get("yield_pct")
        if y is not None and 0 < y <= 100:
            return float(y)
    return None
