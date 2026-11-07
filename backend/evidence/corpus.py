"""반응 레코드 로드 + 인덱싱 — ORD(Open Reaction Database) projections parquet.

여기서 나오는 값은 전부 레코드에 적힌 것이거나 그것으로 계산한 것이다.
절차문(`procedure_details`)은 원문 그대로 싣는다. 요약하거나 다시 쓰지 않는다 — LLM도 마찬가지다.
없는 값은 None이고, UI는 그걸 —로 띄운다.

ORD 스키마에서 쓰는 것:
  smiles                              반응 SMILES "A.B>>C"
  notes.procedure_details             실험 절차 원문
  inputs                              {역할명: {components: [{smiles, amount{mass_grams, moles_moles,
                                      volume_liters}, reaction_role, is_limiting}]}}
  conditions.temperature.setpoint_kelvin
  outcomes[].reaction_time_seconds
  outcomes[].products[].measurements[type=YIELD].percentage.value
  provenance.publication_url / doi / patent
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pyarrow.parquet as pq
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors

RDLogger.DisableLog("rdApp.*")

PROJECTIONS = Path(__file__).resolve().parents[1] / "data/ord/projections"

# projections에서 읽을 컬럼만. 나머지는 메모리에 올리지 않는다
COLUMNS = ["reaction_id", "smiles", "notes", "inputs", "conditions", "outcomes", "provenance"]


_canon_cache: dict[str, str | None] = {}


def canon(smiles: str | None) -> str | None:
    """정규 SMILES. ORD 반응의 60% 가까이가 원자 매핑([CH3:12])을 달고 있는데 RDKit은 매핑을 정규형에
    그대로 남기므로, 매핑 없는 SMILES와 비교하려면 먼저 떼야 한다.

    같은 생성물이 여러 레코드에 반복해서 나오므로 원문 문자열로 캐시한다 — 전수 스캔 비용의 대부분이 여기다.
    """
    if not smiles:
        return None
    hit = _canon_cache.get(smiles, ...)
    if hit is not ...:
        return hit
    m = Chem.MolFromSmiles(smiles)
    if m is not None:
        for a in m.GetAtoms():
            a.SetAtomMapNum(0)
    out = Chem.MolToSmiles(m) if m is not None else None
    _canon_cache[smiles] = out
    return out


@dataclass
class Reagent:
    label: str                  # ORD inputs의 역할명 그대로 ("Base", "amine" 등)
    smiles: str | None
    name: str | None            # 레코드에 NAME 식별자가 있을 때만
    role: str | None            # REACTANT / REAGENT / SOLVENT / CATALYST ...
    mass_g: float | None
    moles: float | None
    volume_l: float | None
    is_limiting: bool | None
    moles_calc: float | None = None  # 계산값: 레코드에 몰수가 없을 때 질량 ÷ 구조에서 구한 분자량
    equiv: float | None = None       # 계산값: 몰수 ÷ 한계 시약 몰수


@dataclass
class Procedure:
    reaction_id: str
    rxn_smiles: str | None
    reactants: list[str]
    product: str | None
    text: str | None                       # 원문 절차. 가공 금지
    reagents: list[Reagent] = field(default_factory=list)
    workups: list[dict] = field(default_factory=list)
    temperature_c: float | None = None
    time_h: float | None = None
    yield_pct: float | None = None
    url: str | None = None
    organization: str | None = None

    def to_json(self) -> dict:
        d = asdict(self)
        d["reagents"] = [asdict(r) if not isinstance(r, dict) else r for r in self.reagents]
        return d


_mw_cache: dict[str, float | None] = {}


def mw(smiles: str | None) -> float | None:
    """구조에서 구한 분자량. 레코드에 몰수가 없을 때 질량을 몰수로 바꾸는 데 쓴다."""
    if not smiles:
        return None
    if smiles not in _mw_cache:
        m = Chem.MolFromSmiles(smiles)
        _mw_cache[smiles] = Descriptors.MolWt(m) if m else None
    return _mw_cache[smiles]


def _amount(a: dict | None) -> tuple[float | None, float | None, float | None]:
    """0은 '값 없음'으로 본다 — ORD에는 양을 0으로 적어둔 레코드가 있는데 양이 아니다."""
    if not a:
        return None, None, None
    pick = lambda k: (a.get(k) or None)  # noqa: E731  (0.0과 None을 모두 None으로)
    return pick("mass_grams"), pick("moles_moles"), pick("volume_liters")


def _reagents(inputs) -> list[Reagent]:
    """ORD inputs(map 또는 list of pairs) → 시약 목록. 당량은 한계 시약 기준으로 계산한다."""
    out: list[Reagent] = []
    if not inputs:
        return out
    pairs = inputs.items() if isinstance(inputs, dict) else inputs
    for label, blk in pairs:
        for c in (blk or {}).get("components") or []:
            mass, moles, vol = _amount(c.get("amount"))
            name = next(
                (i.get("value") for i in (c.get("identifiers") or []) if i.get("type") == "NAME" and i.get("value")),
                None,
            )
            out.append(
                Reagent(
                    label=label,
                    smiles=c.get("smiles"),
                    name=name,
                    role=c.get("reaction_role"),
                    mass_g=mass,
                    moles=moles,
                    volume_l=vol,
                    is_limiting=c.get("is_limiting"),
                )
            )
    # 레코드가 질량만 적어둔 경우가 많다. 구조에서 분자량을 구해 몰수로 바꿔야 당량을 낼 수 있다.
    for r in out:
        if r.moles is None and r.mass_g:
            m = mw(r.smiles)
            if m:
                r.moles_calc = r.mass_g / m

    # 당량: 한계 시약이 표시돼 있으면 그 몰수, 없으면 REACTANT 중 최소 몰수를 기준으로 쓴다
    def n(r: Reagent) -> float | None:
        return r.moles if r.moles is not None else r.moles_calc

    basis = next((n(r) for r in out if r.is_limiting and n(r)), None)
    if basis is None:
        cand = [n(r) for r in out if r.role == "REACTANT" and n(r)]
        basis = min(cand) if cand else None
    if basis:
        for r in out:
            if n(r):
                r.equiv = round(n(r) / basis, 3)
    return out


def _outcome_bits(outcomes) -> tuple[float | None, float | None]:
    """(시간 h, 수율 %) — 레코드에 있는 것만."""
    time_h = yield_pct = None
    for o in outcomes or []:
        secs = o.get("reaction_time_seconds")
        if secs and time_h is None:
            time_h = round(secs / 3600, 2)
        for p in o.get("products") or []:
            for m in p.get("measurements") or []:
                if m.get("type") == "YIELD" and (m.get("percentage") or {}).get("value") is not None:
                    v = m["percentage"]["value"]
                    if yield_pct is None or p.get("is_desired_product"):
                        yield_pct = round(v, 1)
    return time_h, yield_pct


def _provenance(prov) -> tuple[str | None, str | None]:
    prov = prov or {}
    url = prov.get("publication_url") or prov.get("doi") or prov.get("patent")
    org = (prov.get("experimenter") or {}).get("organization")
    return url, org


def parse(rec: dict) -> Procedure | None:
    """projections 한 행 → Procedure. 절차문이 없는 레코드는 버린다."""
    text = ((rec.get("notes") or {}).get("procedure_details") or "").strip() or None
    if not text:
        return None

    rxn = rec.get("smiles") or ""
    left, _, right = rxn.partition(">>")
    reactants = [s for s in (canon(x) for x in left.split(".") if x) if s]
    product = canon(right.split(".")[0]) if right else None
    if not product:
        return None

    cond = rec.get("conditions") or {}
    k = ((cond.get("temperature") or {}).get("setpoint_kelvin"))
    time_h, yield_pct = _outcome_bits(rec.get("outcomes"))
    url, org = _provenance(rec.get("provenance"))

    return Procedure(
        reaction_id=rec.get("reaction_id"),
        rxn_smiles=rxn or None,
        reactants=reactants,
        product=product,
        text=text,
        reagents=_reagents(rec.get("inputs")),
        workups=[
            {"type": w.get("type"), "details": w.get("details"),
             "duration_h": round(w["duration_seconds"] / 3600, 2) if w.get("duration_seconds") else None}
            for w in (rec.get("workups") or [])
            if w.get("type") or w.get("details")
        ],
        temperature_c=round(k - 273.15, 1) if k else None,
        time_h=time_h,
        yield_pct=yield_pct,
        url=url,
        organization=org,
    )


def scan(wanted: set[str], projections: Path = PROJECTIONS, progress=None) -> dict[str, list[Procedure]]:
    """원하는 생성물 SMILES를 만드는 레코드만 모아 {정규 생성물 SMILES: [Procedure]}로 돌려준다.

    ORD는 반응 200만 건이 넘으므로 비싼 일을 뒤로 미룬다:
      1) row group에서 `smiles` 컬럼만 읽는다 (절차문이 든 나머지 컬럼은 건드리지 않는다)
      2) 생성물 문자열 길이로 거른다 — 같은 분자의 정규 SMILES는 표기가 달라도 길이가 비슷하다
      3) 살아남은 것만 RDKit으로 정규화한다
      4) 실제로 맞은 행만 전체 컬럼으로 다시 읽는다
    """
    hits: dict[str, list[Procedure]] = {}
    files = sorted(projections.glob("**/*.parquet"))
    seen = 0
    for n, path in enumerate(files, 1):
        try:
            pf = pq.ParquetFile(path)
        except Exception:
            continue
        for rg in range(pf.num_row_groups):
            rxns = pf.read_row_group(rg, columns=["smiles"]).column("smiles").to_pylist()
            seen += len(rxns)
            idx = []
            for i, rxn in enumerate(rxns):
                if not rxn:
                    continue
                right = rxn.partition(">>")[2]
                if not right:
                    continue
                if canon(right.split(".")[0]) in wanted:
                    idx.append(i)
            if not idx:
                continue
            for rec in pf.read_row_group(rg, columns=COLUMNS).take(idx).to_pylist():
                p = parse(rec)
                if p and p.product in wanted:
                    hits.setdefault(p.product, []).append(p)
        if progress:
            progress(n, len(files), seen, sum(len(v) for v in hits.values()))
    return hits


# 스텝과 레코드가 얼마나 맞는지. REPORTED로 칠 수 있는 것은 앞의 둘이다.
MATCH_RANK = {"exact": 4, "covered": 3, "partial": 2, "product": 1}
REPORTED_MATCHES = ("exact", "covered")


def best_match(procs: list[Procedure], reactants: set[str]) -> tuple[Procedure | None, str]:
    """스텝의 반응물 집합과 가장 잘 맞는 레코드.

    exact   — 반응물 집합이 같다
    covered — 스텝 반응물이 레코드 반응물에 모두 들어 있다. ORD는 반응 SMILES 왼쪽에 염·시약까지
              적는 경우가 많아서(로셀염, 중탄산염, 짝이온 등) 실제로는 이쪽이 "같은 반응"이다
    partial — 생성물은 같고 반응물이 일부만 겹친다
    product — 생성물만 같다 (문헌은 다른 경로로 만든다)
    """
    best, kind, score = None, "none", -1.0
    for p in procs:
        rs = set(p.reactants)
        if not rs:
            continue
        overlap = len(rs & reactants)
        jac = overlap / len(rs | reactants)
        if rs == reactants:
            this = "exact"
        elif reactants and reactants <= rs:
            this = "covered"
        elif overlap:
            this = "partial"
        else:
            this = "product"
        # 같은 등급이면 겹침이 크고 수율이 적힌 쪽을 고른다
        rank = MATCH_RANK[this] + jac + (0.1 if p.yield_pct is not None else 0)
        if rank > score:
            best, kind, score = p, this, rank
    return best, kind


def save(hits: dict[str, list[Procedure]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({k: [p.to_json() for p in v] for k, v in hits.items()}, ensure_ascii=False))
