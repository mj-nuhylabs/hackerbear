"""Explanation generation. Input = already-retrieved records only.

The LLM writes **natural-language prose only**. So the prompt contains no numbers at all:
yield, temperature, time, precedent count and sources are shown by the UI straight from the records; the LLM only writes "why it works".
Given a number, it would repeat it, and a repeated number looks like a record value but is text the LLM wrote.

The output always passes enforce() in evidence/guards.py. On a violation the output is discarded:
it is never repaired and shipped, because after repair you cannot tell what is original and what is an edit.

With no key, we return a reason instead of prose. We do not make anything up.
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
    """One step -> three pieces of prose. On generation failure or guard violation: available=False and a reason."""
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
        except Exception as e:                      # API error, JSON parse failure, etc.
            last = e
            break
    return _unavailable(f"the explanation was discarded: {last}")
