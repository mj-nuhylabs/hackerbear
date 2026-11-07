"""핵심 데이터 모델. 이 모양을 끝까지 유지한다 (CLAUDE_HACKFNM.md 참조)."""
from typing import Literal

from pydantic import BaseModel

EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]


class Compound(BaseModel):
    smiles: str
    inchikey: str | None = None
    mw: float | None = None          # RDKit 계산값
    name: str | None = None
    svg: str | None = None


class Conditions(BaseModel):
    # 전부 문헌 레코드에서만 채운다. 없으면 None. 추정 금지
    solvent: str | None = None
    temperature_c: float | None = None
    time_h: float | None = None
    catalyst: str | None = None
    catalyst_loading: float | None = None   # 몰분율
    source_id: str | None = None


class Evidence(BaseModel):
    tier: EvidenceTier
    source_ids: list[str]        # 특허번호 또는 ORD reaction id
    precedent_count: int         # 이 템플릿의 문헌 선례 수
    url: str | None              # 원본으로 가는 링크


class Step(BaseModel):
    rxn_smiles: str
    template_id: str | None
    reactants: list[Compound]
    product: Compound
    evidence: Evidence
    conditions: Conditions | None      # 없으면 None. 추정 금지
    reported_yield: float | None       # 문헌값. 없으면 None
    assumed_yield: float               # 계산용 가정값. 출처를 label에 명시
    plausibility_raw: float | None
    plausibility_calibrated: float | None


class Route(BaseModel):
    id: str
    steps: list[Step]                  # 위상 정렬, 출발물질 → 타겟
    leaf_materials: list[Compound]     # 구매 대상
