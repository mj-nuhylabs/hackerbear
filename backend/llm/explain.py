"""설명 생성. 입력 = 이미 검색된 레코드뿐.

LLM은 **자연어 설명문만** 쓴다. 그래서 프롬프트에 숫자를 아예 넣지 않는다 —
수율·온도·시간·선례 수·출처는 UI가 레코드값으로 직접 띄우고, LLM은 "왜 되는지"만 쓴다.
숫자를 주면 되풀이하게 되고, 되풀이한 숫자는 레코드값처럼 보이지만 LLM이 쓴 글자다.

출력은 반드시 evidence/guards.py의 enforce()를 통과한다. 위반이면 그 출력은 버린다 —
고쳐서 내보내지 않는다. 고치면 무엇이 원문이고 무엇이 수정본인지 알 수 없다.

키가 없으면 설명문 대신 사유를 돌려준다. 지어내지 않는다.
"""
from __future__ import annotations

import os

from evidence.guards import GuardViolation, enforce

MODEL = "claude-sonnet-5-5"
MAX_TOKENS = 700
MAX_ATTEMPTS = 2

SYSTEM = """You explain one step of a proposed chemical synthesis route to a working chemist.

You will be given only qualitative facts that were retrieved from a reaction corpus. Write prose that
helps the chemist judge the step.

Hard rules, enforced by a code guard that discards your output if you break them:
- Never write a SMILES string or any other structure notation.
- Never write a number with a unit: no yields, temperatures, times, equivalents, masses, concentrations.
- Never write a DOI or a patent number.
- Never state a count, even in words, for how many precedents exist.
- Do not claim a reaction is novel. If the corpus has no precedent, say the corpus has no precedent for it.
- Do not describe a mechanism as established fact for a step the corpus does not record.

The interface already shows the chemist the exact yield, conditions and sources beside your text.
Your job is the reasoning, not the data.

Answer as JSON with exactly three string fields: why_works, why_fails, next_experiment.
Two or three sentences each, plain prose, no markdown."""


def _facts(step: dict, position: int, total: int) -> str:
    ev = step.get("evidence") or {}
    cond = step.get("conditions") or {}
    tier = ev.get("tier")
    precedent = ev.get("precedent_count") or 0
    lines = [
        f"- This is step {position + 1} of {total} in the route.",
        f"- Evidence tier assigned by our corpus: {tier}.",
        {
            "REPORTED": "- The corpus holds a record with these same reactants and this same product.",
            "ANALOGOUS": "- No record of this exact reaction. The reaction template behind it recurs widely in patent reactions.",
            "COMPUTED": "- No record of this exact reaction, and the template behind it has little precedent, or the plausibility model scored it low.",
        }.get(tier, "- Evidence tier unknown."),
        f"- A literature yield is {'recorded' if step.get('reported_yield') is not None else 'not recorded'} for this step.",
        f"- Reaction temperature is {'recorded' if cond.get('temperature_c') is not None else 'not recorded'}.",
        f"- Reaction time is {'recorded' if cond.get('time_h') is not None else 'not recorded'}.",
        f"- Template precedent in the patent corpus is {'substantial' if precedent >= 100 else 'present but thin' if precedent >= 10 else 'very sparse'}.",
    ]
    if step.get("classification") and "Unrecognized" not in str(step["classification"]):
        lines.append(f"- Reaction class recorded for the template: {step['classification']}.")
    if step.get("plausibility_calibrated") is not None:
        p = step["plausibility_calibrated"]
        band = "high" if p >= 0.7 else "middling" if p >= 0.4 else "low"
        lines.append(f"- Our structural plausibility model rates this step {band}. It judges whether the "
                     f"step looks like a real literature reaction rather than a template misapplied to "
                     f"these reactants. Measured against reactions with recorded outcomes it does NOT "
                     f"predict laboratory success, so do not present it as a chance of the reaction working.")
    return "\n".join(lines)


def _unavailable(reason: str) -> dict:
    return {"why_works": None, "why_fails": None, "next_experiment": None,
            "available": False, "reason": reason}


def explain(step: dict, position: int = 0, total: int = 1) -> dict:
    """스텝 하나 → 설명문 셋. 생성 실패나 가드 위반이면 available=False와 사유."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return _unavailable("ANTHROPIC_API_KEY is not set, so no explanation was generated.")

    import json

    import anthropic

    client = anthropic.Anthropic(api_key=key)
    prompt = ("Facts retrieved for this step:\n" + _facts(step, position, total) +
              "\n\nWrite the JSON object now.")
    last: Exception | None = None
    for _ in range(MAX_ATTEMPTS):
        try:
            msg = client.messages.create(
                model=MODEL, max_tokens=MAX_TOKENS, system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
            data = json.loads(text[text.find("{"): text.rfind("}") + 1])
            out = {k: enforce(str(data.get(k, "")).strip()) for k in
                   ("why_works", "why_fails", "next_experiment")}
            return {**out, "available": True, "model": MODEL}
        except GuardViolation as e:
            last = e
            prompt_suffix = "\n\nYour previous answer was discarded: " + str(e) + " Write it again without that."
            prompt += prompt_suffix
        except Exception as e:                      # API 오류, JSON 파싱 실패 등
            last = e
            break
    return _unavailable(f"the explanation was discarded: {last}")
