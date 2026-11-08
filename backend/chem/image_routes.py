"""/recognise router. Attach it in main.py with two lines:

    from chem.image_routes import router as image_router
    app.include_router(image_router)

The router is separate because several people are editing main.py at the same time.
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
    """One structure drawing -> the structure read from it.

    The returned structure is **a guess read by the model.** The frontend must show it next to the original drawing
    and pass it to route search only after the user confirms.
    """
    if file.content_type not in ALLOWED:
        raise HTTPException(415, f"{file.content_type or 'this file type'} is not an image we can read")

    tmp = Path(tempfile.mkdtemp(prefix="synpath-osr-"))
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
            # A failed read is still a result. Report it as is; do not fill in a guess.
            return {**result.to_json(), "ok": False}
        return {**result.to_json(), "ok": True}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
