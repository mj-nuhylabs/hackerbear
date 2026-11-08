"""Structure image -> SMILES. **Runs in an isolated venv (vendor/osr-venv).**

DECIMER pulls in TensorFlow, and putting that in the main venv could conflict with the numpy that
RDKit/AiZynthFinder use. So it has its own venv and is called as a subprocess (backend/chem/image.py).

This script passes through the SMILES the model emits as is. Validation and normalization happen in the main venv, where RDKit lives.

Loading the model takes about 25 seconds. Relaunching per request is unusable, so --serve keeps it resident.

usage:
  vendor/osr-venv/bin/python scripts/osr_predict.py IMAGE [IMAGE ...]   run once and exit
  vendor/osr-venv/bin/python scripts/osr_predict.py --serve             read paths from stdin, one per line
Output: one JSON per line {"path":..., "smiles":..., "confidence":..., "error":...}
--serve prints {"ready": true} on one line first, after the model is fully loaded.
"""
import json
import sys


def load():
    """Depending on the DECIMER version, a function that also returns confidence may or may not exist."""
    import DECIMER  # noqa: N811  (the package name is uppercase)

    with_conf = getattr(DECIMER, "predict_SMILES_with_confidence", None)
    plain = getattr(DECIMER, "predict_SMILES", None)
    if plain is None and with_conf is None:
        raise RuntimeError("DECIMER has neither predict_SMILES nor predict_SMILES_with_confidence")
    return plain, with_conf


def predict(path, plain, with_conf):
    """(smiles, confidence); confidence is None if unavailable. Nothing is invented."""
    if with_conf is not None:
        try:
            out = with_conf(path)
            # Depending on the version, either [(token, conf), ...] or (smiles, conf)
            if isinstance(out, tuple) and len(out) == 2 and isinstance(out[0], str):
                return out[0], float(out[1])
            if isinstance(out, list) and out and isinstance(out[0], (list, tuple)):
                smiles = "".join(str(tok) for tok, _ in out)
                confs = [float(c) for _, c in out if c is not None]
                return smiles, (min(confs) if confs else None)
        except Exception:
            pass  # fall through to plain below
    if plain is None:
        raise RuntimeError("no usable DECIMER entry point")
    return plain(path), None


def one(p, plain, with_conf):
    try:
        smiles, conf = predict(p, plain, with_conf)
        return {"path": p, "smiles": smiles, "confidence": conf, "error": None}
    except Exception as e:
        return {"path": p, "smiles": None, "confidence": None, "error": f"{type(e).__name__}: {e}"}


def emit(rec):
    print(json.dumps(rec, ensure_ascii=False), flush=True)


def main(argv):
    plain, with_conf = load()
    if argv[:1] == ["--serve"]:
        emit({"ready": True})
        for line in sys.stdin:  # one image path per line
            p = line.strip()
            if p:
                emit(one(p, plain, with_conf))
        return
    for p in argv:
        emit(one(p, plain, with_conf))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
