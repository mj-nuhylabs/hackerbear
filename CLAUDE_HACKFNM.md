# SynPath — Literature-Grounded Synthesis Route Planner

Hackathon project. 12 hours of development time. Applied AI track.

## In one line

A chemist enters a target molecule; we return a synthesis route **grounded in real literature records** and what it costs to make 1 g by that route.

---

## Absolute rules — they override everything else

The differentiator of this project is "it does not hallucinate". If any of the rules below is broken, the project is pointless.

1. **The LLM does not generate chemical facts.** The only thing the LLM may output is natural-language explanation text. If the LLM produces a SMILES, yield, price, DOI, patent number or reaction condition, that is a **bug.**
2. **Every number shown in the UI must have a source.** It is either a corpus record's `source_id` or a value computed in code. There is no third source.
3. **If a value is missing, return `None` and show `—` in the UI.** Never fill it with an estimate or a "typical value".
4. **Never claim a reaction is novel.** All we know is that it is not in our corpus. The wording is "No precedent found in our corpus".
5. Never describe the mechanism of a proposed reaction as if it were an experimental fact.

These rules are enforced in code: `evidence/guards.py` holds a guard that raises an exception when it detects a SMILES pattern, a number+unit or a DOI pattern in LLM output, and the explanation-generation path must always pass through it.

---

## Architecture — 3 layers, do not mix the boundaries

```
[Deterministic chemistry engine]  RDKit, reaction templates, stoichiometry
         ↓ route + steps
[Trained model]                   reaction plausibility classifier + calibration
         ↓ score
[LLM]                             explanation text only. Input is only already-retrieved records
```

Each layer consumes only the output of the layer below it. Do not build a structure where the LLM calls the chemistry engine (an agent loop) — it cannot be debugged in 12 hours, and it breaks hallucination control too.

---

## Tech stack

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime | Python 3.10 (conda) | AiZynthFinder supports only 3.9–3.11 |
| Chemistry | RDKit, RDChiral | |
| Route search | AiZynthFinder (pretrained models) | fetched with `download_public_data` |
| ML | LightGBM, scikit-learn | `CalibratedClassifierCV` for calibration |
| Backend | FastAPI + uvicorn | |
| Frontend | Vite + React, single page | Do not use Next.js. The setup time isn't worth it |
| Molecule rendering | RDKit `MolToImage` → SVG string | injected into the frontend as-is |

---

## Data sources

- **USPTO reaction data** — the source of the AiZynthFinder templates. The patent number becomes the source as-is.
- **ORD (Open Reaction Database)** — downloaded directly as parquet from the HuggingFace mirror. `pip install ord-schema` can break the environment because of its PostgreSQL dependency, so **do not use it.**
- **PubChem PUG REST** — name/CAS → SMILES conversion. Free, no API key needed.
- **Prices** — a static snapshot of about 200 building blocks in `data/prices.csv`. The `as_of_date` column is required. Live supplier APIs are out of scope.

---

## Directory structure

```
backend/
  main.py                FastAPI app, routes only
  chem/
    resolve.py           name/CAS/SMILES → canonical SMILES + MW + SVG
    routes.py            wraps AiZynthFinder → Route objects
    templates.py         template application, RDChiral fallback path
  evidence/
    corpus.py            load + index reaction records
    provenance.py        reverse mapping from template → original records
    tiers.py             evidence tier decision
    guards.py            LLM output guard (see the absolute rules)
  model/
    featurize.py         reaction → fingerprint
    train.py             training script (run once, save pkl)
    calibrate.py         isotonic + reliability diagram PNG generation
    predict.py           inference
  cost/
    stoich.py            backward stoichiometry
    prices.py            price lookup
  llm/
    explain.py           explanation generation. Input = list of records only
  data/                  corpus, prices.csv, model.pkl, calibrator.pkl
frontend/
  src/App.jsx            single page
```

---

## Core data model

Define it with Pydantic and keep this shape to the end.

```python
EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]

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
    conditions: Conditions | None      # None if absent. No guessing
    reported_yield: float | None       # literature value. None if absent
    assumed_yield: float               # assumed value for calculation. State the source in the label
    plausibility_raw: float | None
    plausibility_calibrated: float | None

class Route(BaseModel):
    id: str
    steps: list[Step]                  # topologically sorted, starting materials → target
    leaf_materials: list[Compound]     # what to buy
```

---

## API contract

```
POST /resolve   {query, kind}          → {smiles, inchikey, mw, svg}
POST /routes    {smiles, max_depth=4}  → {routes: Route[]}
POST /cost      {route_id, target_g}   → {bom: BomLine[], totals: {...}}
POST /explain   {route_id, step_index} → {why_works, why_fails, next_experiment}
GET  /gaps      ?template_id=          → {untested_substrate_classes: [...]}
GET  /calibration                      → reliability diagram PNG
```

---

## Cost engine formulas — implement exactly as written

This part is pure computation, not ML. It is the part that **must never break in the demo**, so it has to be exactly right.

Walk backward from the last step.

```
# 1. Moles of target required
n_needed[target] = target_mass_g / MW(target)

# 2. For each step i (starting from the target side)
n_rxn[i] = n_needed[product_i] / (yield_i * purification_factor_i)

# 3. For each reactant j of that step
n_needed[reactant_j] += n_rxn[i] * stoich_j * equiv_j

# 4. Catalyst
n_cat[i] = n_rxn[i] * catalyst_loading_i    # loading is a mole fraction

# 5. If a reactant is an intermediate from an earlier step, it becomes that step's n_needed and we recurse
#    If it is a terminal (purchasable) material, stop here

# 6. Cost of terminal materials — keep the two separate and show both
mass_g        = n_needed * MW
consumption   = mass_g * price_per_g                      # based on amount actually consumed
purchase      = ceil(mass_g / pack_size_g) * pack_price   # amount actually paid
```

- `purification_factor` defaults to 0.9 and is adjustable in the UI. **Always label it as an assumed value.**
- `yield_i` is the literature value if there is one; otherwise use an assumed value and mark it `assumed`.
- Total time in days = sum of each step's reaction time + work-up time. Steps with no literature value are left out of the sum and reported as "n steps with unknown time".

---

## Evidence tier rules

```
REPORTED   — an identical reaction record exists in the corpus (reactant set + product match on canonical SMILES)
ANALOGOUS  — a template applied, and that template has 10 or more literature precedents
COMPUTED   — a template applied but with fewer than 10 precedents, or the plausibility score is low
```

The threshold 10 is kept as a tunable constant. UI badge colors: REPORTED green, ANALOGOUS yellow, COMPUTED gray.

---

## ML model spec

**Goal**: binary classification of reaction plausibility + calibrated probability.

- Positive: real reactions from the corpus
- Negative: fake products generated by misapplying a template to the same reactants (1–3 per positive)
- Features: product Morgan fingerprint − sum of reactant Morgan fingerprints (2048 bit, radius 2). DRFP is better if it can be used.
- Model: `LGBMClassifier`, default hyperparameters are enough
- **Calibration is mandatory**: `CalibratedClassifierCV(method="isotonic")` on a holdout; save the reliability diagram as a PNG and serve it at `/calibration`

Do not drop the model even if performance comes out low. Showing the calibration curve as it is is the honest result, and it is a talking point in itself.

---

## Build order

1. `chem/resolve.py` + `/resolve` — first check that input works
2. `chem/routes.py` + `/routes` — wrap AiZynthFinder
3. All of `evidence/` — tiers and provenance
4. Run `model/train.py` (in the background) + implement `cost/` (in parallel)
5. `llm/explain.py`
6. Assemble the frontend

When each step finishes, confirm that its endpoint responds to curl before moving on.

---

## Do not

- Add features that are not in the spec. If an idea comes up, write it in `IDEAS.md` and move on.
- Write a test suite. It's 12 hours, and the 3 demo paths running is the test.
- Agent loops, multi-agent setups, RAG chain structures. You would spend all your time debugging.
- Docker, CI, deployment config. It runs locally.
- Databases. Load parquet/CSV into memory.
- Refactor. If it runs, leave it.
- A broken real implementation is worse than a working stub. Always leave a `# STUB:` comment on a stub.

If you get stuck, stop and ask. Do not switch to an alternative architecture on your own.
