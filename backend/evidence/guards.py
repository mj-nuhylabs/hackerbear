"""LLM 출력 가드 — 절대 규칙을 코드로 강제한다.

프로젝트의 차별점은 "환각하지 않는다"이다. LLM이 출력해도 되는 것은 자연어 설명문뿐이고,
SMILES·수율·가격·DOI·특허번호·반응 조건을 LLM이 만들어내면 **버그다**.

그래서 설명 생성 경로는 반드시 enforce()를 통과해야 한다. 위반이면 예외를 던지고,
llm/explain.py는 그걸 잡아서 설명문 대신 "생성 실패"를 돌려준다 — 걸러낸 텍스트를
고쳐서 내보내지 않는다. 고치면 무엇이 사실이고 무엇이 수정본인지 알 수 없게 된다.

잡는 것:
  SMILES    RDKit가 분자로 읽고, 중원자 3개 이상이며, SMILES 특수문자/숫자를 가진 토큰
  숫자+단위  "76%", "40 °C", "8 h", "2 equiv", "5 mmol" 같은 정량 주장
  DOI       10.xxxx/...
  특허번호    US1234567, US20070213315A1
"""
from __future__ import annotations

import re

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

MIN_HEAVY_ATOMS = 3
SMILES_CHARS = re.compile(r"[\[\]()=#@\\/+]|\d")
# 설명문에 정상적으로 나올 수 있는 단어는 분자로 읽히더라도 통과시킨다
ALLOW = {"i", "in", "on", "no", "nos", "c", "n", "o", "s", "p", "b", "co", "cc", "ccc", "one", "none"}

UNIT = (r"%|°\s?[CFK]|\bK\b|\bdeg\b|°|"
        r"\b(?:h|hr|hrs|hours?|min|mins|minutes?|s|sec|secs|seconds?|d|days?)\b|"
        r"\b(?:[munpk]?g|kg|[munpk]?mol|mol|M|mM|[munp]M|N|[munpk]?L|mL|ppm|Å|eq|equivs?|equivalents?|wt|vol)\b")
NUMBER_UNIT = re.compile(rf"(?<![\w.])\d+(?:[.,]\d+)?\s*(?:{UNIT})", re.IGNORECASE)
DOI = re.compile(r"\b10\.\d{4,9}/\S+", re.IGNORECASE)
PATENT = re.compile(r"\bUS[\s-]?\d{6,11}(?:[A-Z]\d?)?\b")


class GuardViolation(ValueError):
    """LLM이 화학적 사실을 만들어냈다. 그 출력은 쓰지 않는다."""

    def __init__(self, violations: list[dict]):
        self.violations = violations
        detail = "; ".join(f"{v['kind']}: {v['text']!r}" for v in violations)
        super().__init__(f"the generated text states chemical facts it must not ({detail})")


def _looks_like_smiles(token: str) -> bool:
    t = token.strip(".,;:!?\"'()[]")
    if len(t) < 2 or t.lower() in ALLOW or not SMILES_CHARS.search(t):
        return False
    m = Chem.MolFromSmiles(t)
    return m is not None and m.GetNumHeavyAtoms() >= MIN_HEAVY_ATOMS


def check(text: str) -> list[dict]:
    """위반 목록. 비어 있으면 통과다."""
    out: list[dict] = []
    for rx, kind in ((DOI, "doi"), (PATENT, "patent"), (NUMBER_UNIT, "number_with_unit")):
        for m in rx.finditer(text or ""):
            out.append({"kind": kind, "text": m.group(0).strip()})
    for token in re.split(r"\s+", text or ""):
        if _looks_like_smiles(token):
            out.append({"kind": "smiles", "text": token.strip(".,;:!?\"'")})
    return out


def enforce(text: str) -> str:
    """통과하면 원문 그대로, 아니면 GuardViolation. 고쳐서 내보내지 않는다."""
    v = check(text)
    if v:
        raise GuardViolation(v)
    return text
