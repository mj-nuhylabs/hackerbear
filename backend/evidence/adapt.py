"""Rescale a recorded procedure's amounts to our substrates — arithmetic, not a model.

Input: one recorded ORD procedure (evidence/corpus.Procedure as JSON: verbatim text plus the
recorded amount of each input) and one step of our route. Output: a quantity table for our step.

The rule, per recorded input:
    equiv      = recorded moles ÷ recorded moles of the limiting reactant   (corpus.py computes it)
    our mmol   = equiv × our mmol of the matching limiting substrate
    our mass   = our mmol × MW of *our* molecule (our substrate where the recorded one is a
                 substrate, the same reagent otherwise)
    our volume = recorded volume ÷ recorded limiting moles × our limiting moles  (same concentration)

Recorded substrates are paired with ours by Morgan Tanimoto (best assignment). Anything the record
does not state stays None — no equivalents are guessed, no solvent volume is invented. The
procedure text is returned untouched; we never rewrite it with our compound names.
"""
from __future__ import annotations

import itertools

from rdkit import Chem, DataStructs, RDLogger
from rdkit.Chem import Descriptors, rdFingerprintGenerator

from .recorded_routes import flat, substrates_of

RDLogger.DisableLog("rdApp.*")
_gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)


def _mw(smiles: str | None) -> float | None:
    m = Chem.MolFromSmiles(smiles) if smiles else None
    return Descriptors.MolWt(m) if m is not None else None


def _fp(smiles: str):
    m = Chem.MolFromSmiles(smiles)
    return _gen.GetFingerprint(m) if m is not None else None


MIN_PAIR_SIMILARITY = 0.25


def _pair(recorded: list[str], ours: list[str]) -> dict[str, tuple[str, float]]:
    """recorded substrate → (our substrate, Tanimoto), best total similarity over assignments.

    A pair below MIN_PAIR_SIMILARITY is dropped. The best assignment is still an assignment: with
    two substrates on each side it will pair whatever is left over, however unrelated. Calling an
    unrelated molecule "your substrate" would put our structure beside the recorded one's amount,
    so an unmatched recorded input keeps its own identity and the row says it was not matched.
    """
    if not recorded or not ours:
        return {}
    rf = [_fp(r) for r in recorded]
    of = [_fp(o) for o in ours]

    def sim(i, j):
        return DataStructs.TanimotoSimilarity(rf[i], of[j]) if rf[i] is not None and of[j] is not None else 0.0

    best, best_total = {}, -1.0
    n = min(len(recorded), len(ours))
    for rs in itertools.combinations(range(len(recorded)), n):
        for os_ in itertools.permutations(range(len(ours)), n):
            total = sum(sim(i, j) for i, j in zip(rs, os_))
            if total > best_total:
                best_total = total
                best = {recorded[i]: (ours[j], round(sim(i, j), 3)) for i, j in zip(rs, os_)}
    return {k: v for k, v in best.items() if v[1] >= MIN_PAIR_SIMILARITY}


def adapt(procedure: dict, our_substrates: list[str], our_product: str, our_limiting_mmol: float) -> dict:
    """Quantity table for our step from one recorded procedure. See module docstring."""
    reagents = procedure.get("reagents") or []
    rec_product = procedure.get("product") or ""
    rec_flat = [flat(r.get("smiles")) for r in reagents]
    rec_subs = set(substrates_of([x for x in rec_flat if x], flat(rec_product) or ""))
    ours_flat = [flat(s) for s in our_substrates]
    pairing = _pair(sorted(rec_subs), [o for o in ours_flat if o])

    def n_of(r):
        return r.get("moles") if r.get("moles") is not None else r.get("moles_calc")

    # Limiting = the recorded *substrate* flagged limiting, else the substrate with the fewest moles.
    # ORD's mined USPTO records label catalysts and ligands REACTANT too, so the smallest REACTANT
    # (corpus.py's fallback) is often the ligand; equivalents are recomputed here against a substrate.
    subs_with_n = [r for r, rf in zip(reagents, rec_flat) if rf in rec_subs and n_of(r)]
    limiting = next((r for r in subs_with_n if r.get("is_limiting")), None)
    if limiting is None and subs_with_n:
        limiting = min(subs_with_n, key=n_of)
    lim_n = n_of(limiting) if limiting else None

    rows = []
    for r, rf in zip(reagents, rec_flat):
        mapped = pairing.get(rf) if rf in rec_subs else None
        our_smiles = mapped[0] if mapped else rf
        n = n_of(r)
        equiv = round(n / lim_n, 3) if n and lim_n else None
        mmol = round(equiv * our_limiting_mmol, 4) if equiv is not None else None
        mw = _mw(our_smiles)
        vol_ml = None
        if r.get("volume_l") and lim_n:
            vol_ml = round(r["volume_l"] / lim_n * (our_limiting_mmol / 1000.0) * 1000.0, 3)
        rows.append({
            "label": r.get("label"),
            "role": r.get("role"),
            "recorded_smiles": r.get("smiles"),
            "recorded_name": r.get("name"),
            "recorded_mass_g": r.get("mass_g"),
            "recorded_moles": r.get("moles"),
            "recorded_volume_l": r.get("volume_l"),
            "equiv": equiv,
            "is_substrate": bool(mapped),
            # a recorded substrate too unlike any of ours to pair: its own molecule, flagged
            "unmatched_substrate": rf in rec_subs and not mapped,
            "our_smiles": our_smiles,
            "pair_similarity": mapped[1] if mapped else None,
            "mmol": mmol,
            "mass_mg": round(mmol * mw, 2) if mmol is not None and mw else None,
            "volume_ml": vol_ml,
        })
    # Our own substrates the record has no counterpart for. Without a row the chemist would not
    # see how much of their own material to weigh out, so the row exists and says it is unscaled.
    paired_ours = {v[0] for v in pairing.values()}
    for ours in ours_flat:
        if ours and ours not in paired_ours:
            rows.append({
                "label": None, "role": "REACTANT", "recorded_smiles": None, "recorded_name": None,
                "recorded_mass_g": None, "recorded_moles": None, "recorded_volume_l": None,
                "equiv": None, "is_substrate": True, "unmatched_substrate": False,
                "our_smiles": ours, "pair_similarity": None, "mmol": None, "mass_mg": None,
                "volume_ml": None, "no_recorded_counterpart": True,
            })
    missing = [x["recorded_name"] or x["recorded_smiles"] or x["our_smiles"] or x["label"]
               for x in rows if x["equiv"] is None and x["volume_ml"] is None]
    return {
        "reaction_id": procedure.get("reaction_id"),
        "source": procedure.get("url"),
        "text": procedure.get("text"),
        "scale_mmol": our_limiting_mmol,
        "limiting_recorded": limiting.get("smiles") if limiting else None,
        "rows": rows,
        "unscaled_inputs": missing,
        "note": ("Recorded equivalents rescaled to our substrates. The conditions and procedure were "
                 "recorded for a different substrate; they are not reported for this one."),
        "recorded_product": rec_product,
        "our_product": our_product,
    }
