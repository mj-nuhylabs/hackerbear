"""/recognise 라우터. main.py에서 두 줄로 붙인다:

    from chem.image_routes import router as image_router
    app.include_router(image_router)

라우터를 따로 둔 이유는 main.py를 여러 사람이 동시에 고치고 있어서다.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from chem.image import recognise

router = APIRouter()

MAX_BYTES = 12 * 1024 * 1024
ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff"}


@router.post("/recognise")
async def recognise_image(file: UploadFile = File(...)):
    """구조 그림 한 장 → 읽어낸 구조.

    돌려주는 구조는 **모델이 읽은 추측**이다. 프런트는 원본 그림과 나란히 보여주고
    사용자가 확인한 뒤에만 경로 탐색으로 넘겨야 한다.
    """
    if file.content_type not in ALLOWED:
        raise HTTPException(415, f"{file.content_type or 'this file type'} is not an image we can read")

    tmp = Path(tempfile.mkdtemp(prefix="synthpath-osr-"))
    try:
        dest = tmp / (Path(file.filename or "upload").name or "upload")
        size = 0
        with dest.open("wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, f"the image is larger than {MAX_BYTES // (1024 * 1024)} MB")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "the file is empty")

        result = recognise(dest)
        if result.error and result.smiles is None:
            # 못 읽은 것도 결과다. 추측으로 채우지 않고 그대로 알린다.
            return {**result.to_json(), "ok": False}
        return {**result.to_json(), "ok": True}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
