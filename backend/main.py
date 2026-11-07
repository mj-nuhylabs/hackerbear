"""FastAPI 앱, 라우트만."""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from chem.image_routes import router as image_router

DATA = Path(__file__).resolve().parent / "data"

app = FastAPI(title="SynthPath")

# POST /recognise — 구조 그림 → SMILES. DECIMER는 vendor/osr-venv에서 서브프로세스로 돈다
# (TensorFlow를 메인 venv에 올리지 않으려고). import는 가볍다 — TF를 끌고 오지 않는다
app.include_router(image_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/calibration")
def calibration():
    """reliability diagram PNG. 학습 전이면 404 — 자리 채우는 그림을 돌려주지 않는다."""
    png = DATA / "calibration.png"
    if not png.exists():
        raise HTTPException(404, "No calibration diagram yet — run `python -m model.train`.")
    return FileResponse(png, media_type="image/png")


@app.get("/calibration/metrics")
def calibration_metrics():
    """PNG에 적힌 것과 같은 숫자. 전부 model/calibrate.py가 홀드아웃에서 계산한 값이다."""
    path = DATA / "metrics.json"
    if not path.exists():
        raise HTTPException(404, "No metrics yet — run `python -m model.train`.")
    return json.loads(path.read_text())
