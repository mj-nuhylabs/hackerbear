"""FastAPI 앱, 라우트만."""
from fastapi import FastAPI

app = FastAPI(title="SynthPath")


@app.get("/health")
def health():
    return {"status": "ok"}
