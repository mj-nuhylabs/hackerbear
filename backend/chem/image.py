"""Structure drawing -> compound. Keeps DECIMER resident in an isolated venv and calls it over a pipe.

Why a subprocess: DECIMER pulls in TensorFlow, and putting that in the main venv can clash with the numpy
used by RDKit/AiZynthFinder. It is installed separately in vendor/osr-venv and spoken to over pipes.
Model loading takes about 25 s, so the process is kept alive and reused.

The structure it reads is **a model guess, not a record.** Do not pass it straight to route search;
show it to the user and get confirmation first (the UI's job).
"""
from __future__ import annotations

import json
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parents[2]
PYTHON = ROOT / "vendor/osr-venv/bin/python"
SCRIPT = ROOT / "scripts/osr_predict.py"
STARTUP_TIMEOUT_S = 180   # first-time model download can take a while
PREDICT_TIMEOUT_S = 120


class NotInstalled(RuntimeError):
    pass


@dataclass
class Recognised:
    smiles: str | None          # normalized; None if the model output does not parse
    raw_smiles: str | None      # raw model output
    inchikey: str | None
    mw: float | None
    svg: str | None             # redrawn picture of the parsed structure, for the user to compare with the original
    confidence: float | None
    error: str | None

    def to_json(self) -> dict:
        return {
            "smiles": self.smiles,
            "raw_smiles": self.raw_smiles,
            "inchikey": self.inchikey,
            "mw": self.mw,
            "svg": self.svg,
            "confidence": self.confidence,
            "error": self.error,
            "read_by": "DECIMER",   # do not hide the source
        }


class _Engine:
    """Start one osr_predict.py --serve and send it one request at a time."""

    def __init__(self) -> None:
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()

    def _start(self) -> subprocess.Popen:
        if not PYTHON.exists():
            raise NotInstalled(
                f"{PYTHON.relative_to(ROOT)} is missing — create it with:\n"
                f"  uv venv --python 3.10 vendor/osr-venv\n"
                f"  uv pip install --python vendor/osr-venv/bin/python decimer"
            )
        proc = subprocess.Popen(
            [str(PYTHON), str(SCRIPT), "--serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,   # discard the logs TF spews to stderr
            text=True,
            bufsize=1,
            cwd=str(ROOT),
        )
        # wait until the model is loaded
        timer = threading.Timer(STARTUP_TIMEOUT_S, proc.kill)
        timer.start()
        try:
            line = proc.stdout.readline()
        finally:
            timer.cancel()
        if not line or not json.loads(line).get("ready"):
            proc.kill()
            raise NotInstalled("DECIMER did not start — check `vendor/osr-venv/bin/python scripts/osr_predict.py`")
        return proc

    def predict(self, image_path: Path) -> dict:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                self._proc = self._start()
            try:
                self._proc.stdin.write(f"{image_path}\n")
                self._proc.stdin.flush()
                line = self._proc.stdout.readline()
            except (BrokenPipeError, OSError) as e:
                self._proc = None
                return {"smiles": None, "confidence": None, "error": f"engine died: {e}"}
            if not line:
                self._proc = None
                return {"smiles": None, "confidence": None, "error": "engine gave no answer"}
            return json.loads(line)


_engine = _Engine()


def _svg(mol) -> str:
    d = rdMolDraw2D.MolDraw2DSVG(260, 200)
    d.drawOptions().clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
    d.FinishDrawing()
    return d.GetDrawingText().replace("#000000", "currentColor")


def recognise(image_path: str | Path) -> Recognised:
    """Read the structure from one drawing. If unreadable, return with error set -- never fill in a guess."""
    path = Path(image_path)
    if not path.exists():
        return Recognised(None, None, None, None, None, None, f"no such file: {path}")

    try:
        out = _engine.predict(path)
    except NotInstalled as e:
        return Recognised(None, None, None, None, None, None, str(e))

    raw = out.get("smiles")
    if out.get("error") or not raw:
        return Recognised(None, raw, None, None, None, None, out.get("error") or "nothing recognised")

    mol = Chem.MolFromSmiles(raw)
    if mol is None:
        # The model sometimes emits strings that are not valid grammar. Report failure instead of patching them.
        return Recognised(None, raw, None, None, None, out.get("confidence"), "the structure read from the image is not valid")

    return Recognised(
        smiles=Chem.MolToSmiles(mol),
        raw_smiles=raw,
        inchikey=Chem.MolToInchiKey(mol),
        mw=round(Descriptors.MolWt(mol), 2),
        svg=_svg(mol),
        confidence=out.get("confidence"),
        error=None,
    )
