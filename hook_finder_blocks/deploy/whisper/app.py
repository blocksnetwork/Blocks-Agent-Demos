"""Minimal transcription service for Hook Finder.

Exposes one endpoint that takes a media file and returns timestamped segments.
Bound to localhost only; the Blocks agent is the sole caller.
"""

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8_float16")

app = FastAPI()
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".bin"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        path = tmp.name
        while chunk := await file.read(1 << 20):
            tmp.write(chunk)

    try:
        # vad_filter drops silence so long pauses don't eat the context window
        # we later hand to the language model.
        segments, info = model.transcribe(path, vad_filter=True, beam_size=1)
        out = [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
            if s.text.strip()
        ]
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"could not decode media: {exc}")
    finally:
        os.unlink(path)

    if not out:
        raise HTTPException(status_code=422, detail="no speech found in the recording")

    return {
        "language": info.language,
        "duration": round(info.duration, 2),
        "segments": out,
    }
