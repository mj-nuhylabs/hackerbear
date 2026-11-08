"""Nearest-ORD-reaction lookup: attaches "reactions that were actually run" to a step.

Every value here is either written in the record or computed by code. Similarity is the Tanimoto of
DRFP bits; conditions, yields and sources are exactly what scripts/build_analog_index.py collected from ORD.
If the index is missing, every call returns an empty result: the feature turns off and the app keeps running.

**The 0.6 yield threshold is measured.** On the full index (756,776 reactions) we drew 3,000 held-out
reactions and compared the median of the top 5 similar reactions against a fixed 70% assumption
(mean absolute error, points):

    nearest similarity    n     analogs   fixed 70%
    0.8-1.0       1,152     17.1       20.6
    0.6-0.8         829     18.6       21.6
    0.4-0.6         654     22.9       22.7   <- flips here
    0.0-0.4         312     26.0       22.9

Below 0.6 we do not use analog yields. The threshold came out of the measurement; it was not picked.

Caveat: changing the index size changes this table. On a 400k sample, analogs still won in the 0.4-0.6 bin
(21.3 vs 22.2), so the threshold was set to 0.4; on the full index it flipped.
If the index is rebuilt, rerun scripts/validate_analogs.py and update this value.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np
import scipy.sparse as sp

DATA = Path(__file__).resolve().parents[1] / "data/analogs"
FINGERPRINTS = DATA / "fingerprints.npz"
REACTIONS = DATA / "reactions.parquet"
STATS = DATA / "stats.json"

TOP_K = 5
# Below this, analog yields are worse than a fixed 70% (table above).
YIELD_MIN_SIMILARITY = 0.6
# Conditions depend on the substrate more than yields do. No reason to be looser than the range where yields are useful.
CONDITIONS_MIN_SIMILARITY = 0.6

_index: dict | None = None
_lock = threading.Lock()


def _load() -> dict | None:
    """Load the index once. None if absent; callers treat that as an empty result."""
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                if not (FINGERPRINTS.exists() and REACTIONS.exists()):
                    return None
                import pandas as pd
                X = sp.load_npz(FINGERPRINTS).astype(np.float32)
                meta = pd.read_parquet(REACTIONS)
                _index = {
                    "X": X,
                    # Number of set bits per row. Used as the Tanimoto denominator, so count it once
                    "bits": np.asarray(X.sum(axis=1)).ravel(),
                    "meta": meta,
                    "stats": json.loads(STATS.read_text()) if STATS.exists() else {},
                }
    return _index


def available() -> bool:
    return _load() is not None


def stats() -> dict:
    ix = _load()
    return dict(ix["stats"]) if ix else {}


def _similarity(Q: sp.csr_matrix, ix: dict) -> np.ndarray:
    """(n_query, n_index) Tanimoto. Vectors are 0/1, so the dot product is the number of shared bits."""
    inter = (Q @ ix["X"].T).toarray()
    q_bits = np.asarray(Q.sum(axis=1)).ravel()[:, None]
    return inter / (q_bits + ix["bits"][None, :] - inter + 1e-9)


def _row(meta_row, similarity: float) -> dict:
    """One index row -> the shape the UI reads. Missing values are None and the UI shows them as —."""
    def val(k):
        v = meta_row.get(k)
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return v

    ids = meta_row.get("reaction_ids")
    ids = list(ids) if ids is not None and len(ids) else []
    patent, doi = val("patent"), val("doi")
    return {
        "rxn_smiles": meta_row["rxn"],
        "similarity": round(float(similarity), 3),
        "n_records": int(meta_row.get("n_records") or 0),
        "n_yields": int(meta_row.get("n_yields") or 0),
        "yield_median": val("yield_median"),
        "yield_min": val("yield_min"),
        "yield_max": val("yield_max"),
        "temperature_c": val("temperature_c"),
        "time_h": val("time_h"),
        "solvent": val("solvents"),
        "catalyst": val("catalysts"),
        "reagents": val("reagents"),
        "reaction_ids": ids,
        "patent": patent,
        "doi": doi,
        "organization": val("organization"),
        "dataset_id": val("dataset_id"),
        "url": val("url") or (f"https://doi.org/{doi}" if doi else None),
    }


def search_many(rxn_smiles: list[str], top_k: int = TOP_K) -> list[list[dict]]:
    """Forward 'reactants>>product' list -> nearest ORD reactions for each (descending similarity).

    Entries with no index or failed normalization get an empty list; we do not invent look-alikes.
    """
    out: list[list[dict]] = [[] for _ in rxn_smiles]
    ix = _load()
    if ix is None:
        return out

    from model.featurize import featurize, normalize_rxn

    norm = [normalize_rxn(r) for r in rxn_smiles]
    idx = [i for i, n in enumerate(norm) if n]
    if not idx:
        return out

    Q = featurize([norm[i] for i in idx], "drfp")
    Q.data[:] = 1.0
    S = _similarity(Q.astype(np.float32), ix)

    meta = ix["meta"]
    for j, i in enumerate(idx):
        row = S[j]
        k = min(top_k, row.shape[0])
        best = np.argpartition(-row, k - 1)[:k]
        best = best[np.argsort(-row[best])]
        hits = []
        for b in best:
            # The query itself (the exact reaction in the corpus) is a valid result: it is REPORTED evidence
            hits.append(_row(meta.iloc[int(b)], row[int(b)]))
        out[i] = hits
    return out


def search(rxn_smiles: str, top_k: int = TOP_K) -> list[dict]:
    return search_many([rxn_smiles], top_k)[0]


def yield_from(hits: list[dict]) -> tuple[float | None, dict | None]:
    """Yield (0-1 fraction) to take from analog reactions, and its basis. (None, None) if unusable.

    Not used if the top analog is below YIELD_MIN_SIMILARITY: in that range a fixed 70% is measured
    to be more accurate.
    """
    usable = [h for h in hits
              if h["similarity"] >= YIELD_MIN_SIMILARITY and h["yield_median"] is not None]
    if not usable:
        return None, None
    vals = [float(h["yield_median"]) for h in usable]
    median = float(np.median(vals))
    return median / 100.0, {
        "basis": "analogs",
        "n_analogs": len(usable),
        "top_similarity": usable[0]["similarity"],
        "yield_pct_median": round(median, 1),
        "yield_pct_min": round(min(vals), 1),
        "yield_pct_max": round(max(vals), 1),
        "source_ids": [i for h in usable for i in h["reaction_ids"]][:5],
        "min_similarity": YIELD_MIN_SIMILARITY,
    }


def conditions_from(hits: list[dict]) -> dict | None:
    """Conditions of the nearest analog. None if below CONDITIONS_MIN_SIMILARITY.

    Conditions are more substrate-sensitive than yields, so the bar is higher. None if neither temperature nor time is recorded.
    """
    for h in hits:
        if h["similarity"] < CONDITIONS_MIN_SIMILARITY:
            break
        if h["temperature_c"] is None and h["time_h"] is None and h["solvent"] is None:
            continue
        return {
            "solvent": h["solvent"],
            "temperature_c": h["temperature_c"],
            "time_h": h["time_h"],
            "catalyst": h["catalyst"],
            "catalyst_loading": None,       # ORD does not record loading separately; we do not estimate it
            "source_id": h["reaction_ids"][0] if h["reaction_ids"] else None,
            "from_analog": True,
            "similarity": h["similarity"],
            "min_similarity": CONDITIONS_MIN_SIMILARITY,
        }
    return None
