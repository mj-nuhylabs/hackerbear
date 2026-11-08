"""FastAPI 앱, 라우트만."""
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from chem.image_routes import router as image_router
from chem.resolve import ResolveError, resolve as resolve_query

# 저장소 루트의 .env (ANTHROPIC_API_KEY). 셸에 이미 있는 값은 덮어쓰지 않는다
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATA = Path(__file__).resolve().parent / "data"

app = FastAPI(title="SynthPath")

# POST /recognise — 구조 그림 → SMILES. DECIMER는 vendor/osr-venv에서 서브프로세스로 돈다
# (TensorFlow를 메인 venv에 올리지 않으려고). import는 가볍다 — TF를 끌고 오지 않는다
app.include_router(image_router)


@app.get("/health")
def health():
    return {"status": "ok"}


class ExplainIn(BaseModel):
    route_id: str
    step_index: int


@app.post("/explain")
def explain(body: ExplainIn):
    """스텝 설명문. LLM은 산문만 쓰고, 출력은 evidence/guards.py를 통과해야 나간다.

    가드에 걸리거나 키가 없으면 available=false와 사유를 돌려준다 — 지어낸 문장을 돌려주지 않는다.
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
    purification_factor: float = 0.9   # 가정값. UI가 조절하고 라벨을 붙인다


@app.post("/cost")
def cost(body: CostIn):
    """경로 + 목표 질량 → BOM과 합계. 순수 계산이고, 가정값은 전부 결과에 표시된다."""
    from chem.routes import ROUTES
    from cost.prices import lookup
    from cost.stoich import bom

    route = ROUTES.get(body.route_id)
    if route is None:
        raise HTTPException(404, f"No route {body.route_id!r} in this session — run /routes first.")
    if body.target_g <= 0:
        raise HTTPException(422, "target_g must be greater than 0")
    leaves = route["leaf_materials"]
    prices = lookup([m["smiles"] for m in leaves])
    return bom(route["steps"], leaves, body.target_g, prices, body.purification_factor)


class ResolveIn(BaseModel):
    query: str
    kind: str = "auto"          # smiles | name | cas | auto


class RoutesIn(BaseModel):
    smiles: str
    max_depth: int = 4
    time_limit_s: int = 45


@app.post("/routes")
def routes(body: RoutesIn):
    """타겟 SMILES → 경로 목록. 경로·선례는 AiZynthFinder, 점수는 model/, 출처는 evidence/."""
    from chem.routes import search
    try:
        return search(body.smiles, body.max_depth, time_limit_s=body.time_limit_s)
    except ResolveError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/resolve")
def resolve(body: ResolveIn):
    """이름/CAS/SMILES → 정규 SMILES + MW + InChIKey + SVG.

    구조는 RDKit 계산값, 이름↔구조는 PubChem 응답 그대로. 못 읽으면 404다 — 비슷한 걸 돌려주지 않는다.
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
    """스텝 하나의 가까운 ORD 반응들. 전부 레코드값이고, 유사도만 코드 계산값이다.

    인덱스가 없으면 available=false와 사유를 돌려준다 — 빈 리스트로 "선례 없음"처럼 보이게
    하지 않는다. 둘은 다른 얘기다.
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
    """유사 반응 수율이 고정 가정값을 이기는지 재본 수치. 구간별 오차까지 그대로 돌려준다."""
    path = DATA / "analog_validation.json"
    if not path.exists():
        raise HTTPException(404, "No analog validation yet — run `python scripts/validate_analogs.py`.")
    return json.loads(path.read_text())


@app.get("/calibration")
def calibration():
    """reliability diagram PNG. 학습 전이면 404 — 자리 채우는 그림을 돌려주지 않는다."""
    png = DATA / "calibration.png"
    if not png.exists():
        raise HTTPException(404, "No calibration diagram yet — run `python -m model.train`.")
    return FileResponse(png, media_type="image/png")


@app.get("/validation")
def validation():
    """외부 검증 그림 — 기록된 실제 결과에 대고 재본 결과. 결과가 나쁘면 나쁜 대로 띄운다."""
    png = DATA / "external_validation.png"
    if not png.exists():
        raise HTTPException(404, "No external validation yet — run `python scripts/validate_external.py`.")
    return FileResponse(png, media_type="image/png")


@app.get("/validation/metrics")
def validation_metrics():
    """구조적 타당성 점수가 실제 반응 결과를 맞히는지 재본 수치. 전부 코드 계산값이다."""
    path = DATA / "external_validation.json"
    if not path.exists():
        raise HTTPException(404, "No external validation yet — run `python scripts/validate_external.py`.")
    return json.loads(path.read_text())


@app.get("/rankers/metrics")
def ranker_metrics():
    """두 랭킹 모델의 측정 수치. 아직 학습 전이면 그 모델은 null이다 — 자리 채우는 숫자를 돌려주지 않는다.

    transfer: 스텝에 맞는 기록된 절차를 고르는 모델 (model/transfer_ranker.py)
    route:    기록된 경로를 닮은 후보 경로를 위로 올리는 모델 (model/route_ranker.py)
    둘 다 데모 타겟 5개와 그 중간체를 학습에서 빼고(model/holdout.py) 재본 값이다.
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
    """PNG에 적힌 것과 같은 숫자. 전부 model/calibrate.py가 홀드아웃에서 계산한 값이다."""
    path = DATA / "metrics.json"
    if not path.exists():
        raise HTTPException(404, "No metrics yet — run `python -m model.train`.")
    return json.loads(path.read_text())
