"""FastAPI app, routes only."""
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from chem.image_routes import router as image_router
from chem.resolve import ResolveError, resolve as resolve_query

# .env at the repo root (ANTHROPIC_API_KEY). Values already in the shell are not overwritten
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATA = Path(__file__).resolve().parent / "data"

app = FastAPI(title="SynPath")

# POST /recognise -- structure drawing -> SMILES. DECIMER runs as a subprocess in vendor/osr-venv
# (to keep TensorFlow out of the main venv). The import is light -- it does not pull in TF
app.include_router(image_router)


@app.get("/health")
def health():
    return {"status": "ok"}


class ExplainIn(BaseModel):
    route_id: str
    step_index: int


@app.post("/explain")
def explain(body: ExplainIn):
    """Step explanation. The LLM writes prose only, and its output must pass evidence/guards.py before it goes out.

    If the guard trips or there is no key, return available=false with the reason -- never return an invented sentence.
    """
    from chem.routes import ROUTES
    from llm.explain import explain as generate

    route = ROUTES.get(body.route_id)
    if route is None:
        raise HTTPException(404, f"No route {body.route_id!r} in this session — run /routes first.")
    steps = route["steps"]
    if not 0 <= body.step_index < len(steps):
        raise HTTPException(422, f"step_index must be between 0 and {len(steps) - 1}")
    return generate(steps[body.step_index], body.step_index, len(steps))


class CostIn(BaseModel):
    route_id: str
    target_g: float = 1.0
    purification_factor: float = 0.9   # assumed value. The UI adjusts it and attaches a label


@app.post("/cost")
def cost(body: CostIn):
    """Route + target mass -> BOM and totals. Pure calculation; every assumed value is marked in the result."""
    from chem.routes import ROUTES
    from cost.prices import lookup
    from cost.stoich import bom, buy_vs_make

    route = ROUTES.get(body.route_id)
    if route is None:
        raise HTTPException(404, f"No route {body.route_id!r} in this session — run /routes first.")
    if body.target_g <= 0:
        raise HTTPException(422, "target_g must be greater than 0")
    leaves = route["leaf_materials"]
    prices = lookup([m["smiles"] for m in leaves])
    out = bom(route["steps"], leaves, body.target_g, prices, body.purification_factor)
    # Catalog price of the target itself. If buying is cheaper than making, tell the user
    target = route["steps"][-1]["product"] if route["steps"] else None
    target_price = lookup([target["smiles"]]).get(target["smiles"]) if target else None
    out["buy"] = buy_vs_make(target, body.target_g, target_price, out["totals"])
    return out


class ResolveIn(BaseModel):
    query: str
    kind: str = "auto"          # smiles | name | cas | auto


class RoutesIn(BaseModel):
    smiles: str
    max_depth: int = 4
    time_limit_s: int = 45


@app.post("/routes")
def routes(body: RoutesIn):
    """Target SMILES -> list of routes. Routes/precedents from AiZynthFinder, scores from model/, sources from evidence/."""
    from chem.routes import search
    try:
        return search(body.smiles, body.max_depth, time_limit_s=body.time_limit_s)
    except ResolveError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/resolve")
def resolve(body: ResolveIn):
    """Name/CAS/SMILES -> canonical SMILES + MW + InChIKey + SVG.

    Structure is RDKit-computed, name<->structure is the PubChem response verbatim. 404 if unreadable -- no look-alike is returned.
    """
    try:
        return resolve_query(body.query, body.kind)
    except ResolveError as e:
        raise HTTPException(404, str(e)) from e


class AnalogsIn(BaseModel):
    route_id: str
    step_index: int
    top_k: int = 5


@app.post("/analogs")
def analogs_for_step(body: AnalogsIn):
    """Nearest ORD reactions for one step. All are record values; only the similarity is code-computed.

    If there is no index, return available=false with the reason -- do not let an empty list look like
    "no precedent". They are different things.
    """
    from chem.routes import ROUTES
    from evidence import analogs

    route = ROUTES.get(body.route_id)
    if route is None:
        raise HTTPException(404, f"No route {body.route_id!r} in this session — run /routes first.")
    steps = route["steps"]
    if not 0 <= body.step_index < len(steps):
        raise HTTPException(422, f"step_index must be between 0 and {len(steps) - 1}")
    if not analogs.available():
        return {"available": False, "analogs": [],
                "reason": "No analog index — run `python scripts/build_analog_index.py`."}
    hits = analogs.search(steps[body.step_index]["rxn_smiles"], max(1, min(body.top_k, 25)))
    return {"available": True, "analogs": hits, "index": analogs.stats()}


@app.get("/analogs/metrics")
def analog_metrics():
    """Measurement of whether analog-reaction yields beat the fixed assumed value. Returns the per-bin error as is."""
    path = DATA / "analog_validation.json"
    if not path.exists():
        raise HTTPException(404, "No analog validation yet — run `python scripts/validate_analogs.py`.")
    return json.loads(path.read_text())


@app.get("/calibration")
def calibration():
    """Reliability diagram PNG. 404 before training -- no placeholder image is returned."""
    png = DATA / "calibration.png"
    if not png.exists():
        raise HTTPException(404, "No calibration diagram yet — run `python -m model.train`.")
    return FileResponse(png, media_type="image/png")


@app.get("/validation")
def validation():
    """External validation figure -- measured against recorded real outcomes. Shown as is, even if the result is bad."""
    png = DATA / "external_validation.png"
    if not png.exists():
        raise HTTPException(404, "No external validation yet — run `python scripts/validate_external.py`.")
    return FileResponse(png, media_type="image/png")


@app.get("/validation/metrics")
def validation_metrics():
    """Measurement of whether the structural plausibility score predicts real reaction outcomes. All code-computed values."""
    path = DATA / "external_validation.json"
    if not path.exists():
        raise HTTPException(404, "No external validation yet — run `python scripts/validate_external.py`.")
    return json.loads(path.read_text())


@app.get("/rankers/metrics")
def ranker_metrics():
    """Measured numbers for the two ranking models. If not yet trained, that model is null -- no placeholder numbers are returned.

    transfer: model that picks the recorded procedure that fits a step (model/transfer_ranker.py)
    route:    model that lifts candidate routes resembling recorded routes (model/route_ranker.py)
    Both are measured with the 5 demo targets and their intermediates held out of training (model/holdout.py).
    """
    def read(name):
        p = DATA / name
        return json.loads(p.read_text()) if p.exists() else None

    transfer, route = read("transfer_ranker_metrics.json"), read("route_ranker_metrics.json")
    if transfer is None and route is None:
        raise HTTPException(404, "No ranker metrics yet — run `python -m model.transfer_ranker --train`.")
    return {"transfer": transfer, "route": route}


@app.get("/calibration/metrics")
def calibration_metrics():
    """The same numbers as written on the PNG. All computed by model/calibrate.py on the holdout."""
    path = DATA / "metrics.json"
    if not path.exists():
        raise HTTPException(404, "No metrics yet — run `python -m model.train`.")
    return json.loads(path.read_text())
