"""역방향 양론. CLAUDE_HACKFNM.md의 수식을 그대로 구현한다.

ML이 아니라 순수 계산이다. 데모에서 깨지면 안 되는 부분이므로 수식을 정확히 맞춘다.

    n_needed[target]      = target_mass_g / MW(target)
    n_rxn[i]              = n_needed[product_i] / (yield_i * purification_factor_i)
    n_needed[reactant_j] += n_rxn[i] * stoich_j * equiv_j
    n_cat[i]              = n_rxn[i] * catalyst_loading_i
    mass_g                = n_needed * MW
    consumption           = mass_g * price_per_g                    # 실제 소비량 기준
    purchase              = ceil(mass_g / pack_size_g) * pack_price # 실제 지불액

가정값(purification_factor, equiv, 문헌값 없을 때의 yield)은 전부 결과에 플래그로 남긴다.
"""
from __future__ import annotations

import math
from collections import Counter

DEFAULT_PURIFICATION_FACTOR = 0.9   # 가정값. UI에서 조절 가능하게 하고 라벨을 붙인다
DEFAULT_EQUIV = 1.0                 # 당량. 레코드에 없으면 1.0으로 둔다


def _mw(c: dict) -> float | None:
    mw = c.get("mw")
    return float(mw) if mw else None


def rollup(steps: list[dict], target_g: float,
           purification_factor: float = DEFAULT_PURIFICATION_FACTOR) -> dict:
    """스텝(출발물질→타겟 위상 순서) + 목표 질량 → 말단 물질별 필요 몰수.

    마지막 스텝의 생성물을 타겟으로 본다. 중간체는 앞 스텝으로 재귀적으로 전달된다.
    """
    if not steps:
        return {"n_needed": {}, "n_rxn": {}, "catalysts": {}, "target": None, "warnings": ["no steps"]}
    warnings: list[str] = []
    target = steps[-1]["product"]
    mw_t = _mw(target)
    if not mw_t:
        return {"n_needed": {}, "n_rxn": {}, "catalysts": {}, "target": target,
                "warnings": ["the target has no molecular weight, so nothing can be scaled"]}

    n_needed: dict[str, float] = {target["smiles"]: target_g / mw_t}
    n_rxn: dict[int, float] = {}
    catalysts: dict[str, float] = {}

    # 타겟 쪽(마지막 스텝)부터 거꾸로
    for i in range(len(steps) - 1, -1, -1):
        s = steps[i]
        prod = s["product"]["smiles"]
        need = n_needed.get(prod)
        if not need:
            # 이 스텝의 생성물을 아무도 안 쓴다 (수렴 경로에서 생길 수 있다)
            continue
        y = float(s.get("assumed_yield") or 0.0)
        if y <= 0:
            warnings.append(f"step {i} has no usable yield, so its demand cannot be scaled")
            continue
        rxn = need / (y * purification_factor)
        n_rxn[i] = rxn
        # 같은 반응물이 두 번 적혀 있으면 그 횟수가 stoich가 된다
        for smi, stoich in Counter(r["smiles"] for r in s["reactants"]).items():
            n_needed[smi] = n_needed.get(smi, 0.0) + rxn * stoich * DEFAULT_EQUIV
        cond = s.get("conditions") or {}
        loading = cond.get("catalyst_loading")
        cat = cond.get("catalyst")
        if cat and loading:
            catalysts[cat] = catalysts.get(cat, 0.0) + rxn * float(loading)

    return {"n_needed": n_needed, "n_rxn": n_rxn, "catalysts": catalysts,
            "target": target, "warnings": warnings}


def bom(steps: list[dict], leaf_materials: list[dict], target_g: float,
        prices: dict[str, dict], purification_factor: float = DEFAULT_PURIFICATION_FACTOR) -> dict:
    """구매해야 하는 말단 물질별 BOM 한 줄씩 + 합계.

    가격이 없는 물질은 비용을 None으로 둔다 — 0으로 세지 않는다. 0으로 세면 합계가 거짓말이 된다.
    """
    roll = rollup(steps, target_g, purification_factor)
    intermediates = {s["product"]["smiles"] for s in steps}
    lines, unpriced = [], 0
    total_consumption = total_purchase = 0.0

    by_smiles = {m["smiles"]: m for m in leaf_materials}
    for smi, moles in sorted(roll["n_needed"].items(), key=lambda kv: -kv[1]):
        if smi in intermediates:
            continue                      # 중간체는 사지 않는다
        mat = by_smiles.get(smi, {"smiles": smi})
        mw = _mw(mat)
        mass_g = moles * mw if mw else None
        p = prices.get(smi)
        consumption = purchase = packs = None
        if mass_g is not None and p:
            ppg, pack_g, pack_price = p.get("price_per_g"), p.get("pack_size_g"), p.get("pack_price")
            if ppg is not None:
                consumption = mass_g * float(ppg)
                total_consumption += consumption
            if pack_g and pack_price is not None:
                packs = math.ceil(mass_g / float(pack_g))
                purchase = packs * float(pack_price)
                total_purchase += purchase
        if p is None:
            unpriced += 1
        lines.append({
            "smiles": smi,
            "name": mat.get("name"),
            "mw": mw,
            "moles": moles,
            "mass_g": mass_g,
            "in_stock": mat.get("in_stock"),
            "price_per_g": (p or {}).get("price_per_g"),
            "pack_size_g": (p or {}).get("pack_size_g"),
            "pack_price": (p or {}).get("pack_price"),
            "packs": packs,
            "consumption_cost": consumption,
            "purchase_cost": purchase,
            "currency": (p or {}).get("currency"),
            "supplier": (p or {}).get("supplier"),
            "as_of_date": (p or {}).get("as_of_date"),
            "price_is_mock": bool((p or {}).get("is_mock")),
        })

    steps_with_time = [s for s in steps if (s.get("conditions") or {}).get("time_h") is not None]
    total_h = sum((s["conditions"]["time_h"] for s in steps_with_time), 0.0)
    assumed_yield_steps = sum(1 for s in steps if s.get("yield_is_assumed"))

    return {
        "bom": lines,
        "totals": {
            "target_g": target_g,
            "consumption_cost": total_consumption if total_consumption else None,
            "purchase_cost": total_purchase if total_purchase else None,
            "currency": next((l["currency"] for l in lines if l["currency"]), None),
            "unpriced_materials": unpriced,
            # 시간은 조건이 있는 스텝만 더한다. 나머지는 "미상"으로 센다 (합계에 넣지 않는다)
            "reaction_time_h": total_h if steps_with_time else None,
            "steps_without_time": len(steps) - len(steps_with_time),
        },
        # 스텝별 규모 (steps와 같은 순서). 생성물을 아무도 안 쓰는 스텝은 n_rxn이 None이다
        "steps": [{"n_rxn": roll["n_rxn"].get(i),
                   "yield": float(s.get("assumed_yield") or 0.0) or None,
                   "yield_is_assumed": bool(s.get("yield_is_assumed"))}
                  for i, s in enumerate(steps)],
        "assumptions": {
            "purification_factor": purification_factor,
            "equivalents": DEFAULT_EQUIV,
            "steps_using_assumed_yield": assumed_yield_steps,
            "steps_total": len(steps),
        },
        "warnings": roll["warnings"],
    }
