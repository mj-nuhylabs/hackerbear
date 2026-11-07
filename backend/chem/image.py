"""구조 그림 → 화합물. DECIMER를 격리 venv에서 상주시켜 부른다.

왜 서브프로세스인가: DECIMER는 TensorFlow를 끌고 오는데 그걸 메인 venv에 넣으면 RDKit/
AiZynthFinder가 쓰는 numpy와 충돌할 수 있다. vendor/osr-venv에 따로 깔고 파이프로 말한다.
모델 로딩이 25초쯤 걸리므로 프로세스를 띄워둔 채 재사용한다.

읽어낸 구조는 **모델의 추측이지 레코드가 아니다.** 그대로 경로 탐색에 넘기지 말고
사용자에게 보여주고 확인받아야 한다 (UI의 역할).
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
STARTUP_TIMEOUT_S = 180   # 모델을 처음 받을 때는 오래 걸린다
PREDICT_TIMEOUT_S = 120


class NotInstalled(RuntimeError):
    pass


@dataclass
class Recognised:
    smiles: str | None          # 정규화된 것. 모델 출력이 파싱되지 않으면 None
    raw_smiles: str | None      # 모델이 뱉은 원문
    inchikey: str | None
    mw: float | None
    svg: str | None             # 읽어낸 구조를 다시 그린 그림 — 사용자가 원본과 대조할 용도
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
            "read_by": "DECIMER",   # 출처를 숨기지 않는다
        }


class _Engine:
    """osr_predict.py --serve 를 하나 띄워두고 한 번에 한 요청씩 보낸다."""

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
            stderr=subprocess.DEVNULL,   # TF가 stderr로 쏟아내는 로그는 버린다
            text=True,
            bufsize=1,
            cwd=str(ROOT),
        )
        # 모델이 올라올 때까지 기다린다
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
    """그림 한 장에서 구조를 읽는다. 읽히지 않으면 error를 채워 돌려준다 — 추측으로 채우지 않는다."""
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
        # 모델이 문법에 안 맞는 문자열을 뱉는 일이 있다. 고쳐 쓰지 않고 실패로 보고한다.
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
