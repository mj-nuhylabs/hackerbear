"""Core data models. Keep this shape to the end (see CLAUDE_HACKFNM.md)."""
from typing import Literal

from pydantic import BaseModel

EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]


class Compound(BaseModel):
    smiles: str
    inchikey: str | None = None
    mw: float | None = None          # RDKit-computed
    name: str | None = None
    svg: str | None = None


class Conditions(BaseModel):
    # Fill only from literature records. None if absent. No estimation
    solvent: str | None = None
    temperature_c: float | None = None
    time_h: float | None = None
    catalyst: str | None = None
    catalyst_loading: float | None = None   # mole fraction
    source_id: str | None = None


class Evidence(BaseModel):
    tier: EvidenceTier
    source_ids: list[str]        # patent number or ORD reaction id
    precedent_count: int         # number of literature precedents for this template
    url: str | None              # link to the original


class Step(BaseModel):
    rxn_smiles: str
    template_id: str | None
    reactants: list[Compound]
    product: Compound
    evidence: Evidence
    conditions: Conditions | None      # None if absent. No estimation
    reported_yield: float | None       # literature value. None if absent
    assumed_yield: float               # assumed value for calculation. State the source in the label
    plausibility_raw: float | None
    plausibility_calibrated: float | None


class Route(BaseModel):
    id: str
    steps: list[Step]                  # topologically sorted, starting materials -> target
    leaf_materials: list[Compound]     # to be purchased
