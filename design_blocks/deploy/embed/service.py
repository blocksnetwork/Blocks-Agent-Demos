"""Embedding + image utility sidecar for Design Blocks.

CLIP ViT-B/32 on CPU (openai/clip-vit-base-patch32, ~600MB) gives the
bank its retrieval: text briefs and reference images land in the same
space, so "dark moody fintech" finds the right boards. PIL does the rest:
palette extraction, thumbnails, contact sheets. Zero GPU.

POST /embed_text   {"text": "..."}          -> {"embedding": [512 floats]}
POST /embed_image  multipart file           -> {"embedding": [512 floats]}
POST /palette      multipart file           -> {"colors": ["#rrggbb" x6]}
POST /thumb        multipart file           -> image/jpeg (480px wide)
POST /sheet        multipart files[]        -> image/jpeg contact sheet
POST /cutout       multipart file           -> image/png RGBA, background removed
GET  /health                                -> {"ok": true, "model": "..."}
"""

import io
import math

import torch
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "openai/clip-vit-base-patch32"
THUMB_WIDTH = 480

app = FastAPI()
model = CLIPModel.from_pretrained(MODEL_ID)
processor = CLIPProcessor.from_pretrained(MODEL_ID)
model.eval()


class TextIn(BaseModel):
    text: str


def normalized(features: torch.Tensor) -> list[float]:
    vector = features[0]
    return (vector / vector.norm()).tolist()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_ID}


@app.post("/embed_text")
def embed_text(body: TextIn) -> dict:
    inputs = processor(text=[body.text], return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        features = model.get_text_features(**inputs)
    return {"embedding": normalized(features)}


@app.post("/embed_image")
async def embed_image(file: UploadFile = File(...)) -> dict:
    image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    inputs = processor(images=[image], return_tensors="pt")
    with torch.no_grad():
        features = model.get_image_features(**inputs)
    return {"embedding": normalized(features)}


@app.post("/palette")
async def palette(file: UploadFile = File(...)) -> dict:
    image = Image.open(io.BytesIO(await file.read())).convert("RGB").resize((128, 128))
    quantized = image.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    raw = quantized.getpalette()[: 6 * 3]
    counts = sorted(quantized.getcolors(), reverse=True)  # [(count, index)]
    colors = []
    for _count, index in counts:
        r, g, b = raw[index * 3 : index * 3 + 3]
        colors.append(f"#{r:02x}{g:02x}{b:02x}")
    return {"colors": colors}


def to_jpeg(image: Image.Image, quality: int = 82) -> bytes:
    out = io.BytesIO()
    image.convert("RGB").save(out, format="JPEG", quality=quality)
    return out.getvalue()


@app.post("/thumb")
async def thumb(file: UploadFile = File(...)) -> Response:
    image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    height = max(1, round(image.height * THUMB_WIDTH / image.width))
    return Response(content=to_jpeg(image.resize((THUMB_WIDTH, height))), media_type="image/jpeg")


@app.post("/sheet")
async def sheet(files: list[UploadFile] = File(...)) -> Response:
    images = [Image.open(io.BytesIO(await f.read())).convert("RGB") for f in files]
    columns = 2 if len(images) > 1 else 1
    rows = math.ceil(len(images) / columns)
    cell_w = THUMB_WIDTH
    gap = 12

    scaled = []
    for image in images:
        height = max(1, round(image.height * cell_w / image.width))
        scaled.append(image.resize((cell_w, height)))
    row_heights = [
        max(im.height for im in scaled[r * columns : (r + 1) * columns])
        for r in range(rows)
    ]

    canvas = Image.new(
        "RGB",
        (columns * cell_w + (columns + 1) * gap, sum(row_heights) + (rows + 1) * gap),
        (250, 250, 249),
    )
    y = gap
    for r in range(rows):
        for c in range(columns):
            index = r * columns + c
            if index >= len(scaled):
                break
            canvas.paste(scaled[index], (gap + c * (cell_w + gap), y))
        y += row_heights[r] + gap

    return Response(content=to_jpeg(canvas), media_type="image/jpeg")


try:  # optional: pip install rembg (U2Net, CPU). The flood-fill path needs nothing.
    from rembg import remove as rembg_remove
except ImportError:
    rembg_remove = None


def _floodfill_cutout(image: Image.Image, tolerance: int = 34) -> Image.Image:
    """Alpha-key the background by flooding from the four corners.

    Works on the studio-style generations the imagine sidecar produces
    (single subject on a plain backdrop); busy backgrounds keep most of
    their pixels, which the caller treats as a low-confidence cutout.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    seen = bytearray(width * height)
    stack = list(corners)
    keys = [pixels[x, y][:3] for x, y in corners]

    def is_background(rgb: tuple) -> bool:
        return any(
            abs(rgb[0] - k[0]) + abs(rgb[1] - k[1]) + abs(rgb[2] - k[2]) <= tolerance * 3
            for k in keys
        )

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= width or y >= height or seen[y * width + x]:
            continue
        seen[y * width + x] = 1
        r, g, b, _a = pixels[x, y]
        if not is_background((r, g, b)):
            continue
        pixels[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return rgba


@app.post("/cutout")
async def cutout(file: UploadFile = File(...)) -> Response:
    """Background-removed RGBA PNG so an image can act as a foreground
    cutout / container-breaking subject instead of a rectangle. rembg
    when installed, corner flood-fill otherwise. X-Cutout-Alpha reports
    the fraction of pixels made transparent — near 0 means the cutout
    failed and the caller should fall back to a contained treatment."""
    raw = await file.read()
    if rembg_remove is not None:
        result = Image.open(io.BytesIO(rembg_remove(raw))).convert("RGBA")
    else:
        result = _floodfill_cutout(Image.open(io.BytesIO(raw)))
    alpha = result.getchannel("A")
    transparent = sum(1 for value in alpha.getdata() if value < 8)
    out = io.BytesIO()
    result.save(out, format="PNG")
    return Response(
        content=out.getvalue(),
        media_type="image/png",
        headers={"X-Cutout-Alpha": f"{transparent / (result.width * result.height):.3f}"},
    )
