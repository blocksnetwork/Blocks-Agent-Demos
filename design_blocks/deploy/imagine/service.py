"""Image-generation sidecar for Design Blocks.

Sana 600M (Efficient-Large-Model/Sana_600M_1024px_diffusers, Apache 2.0
weights; its Gemma2-2B-IT text encoder carries Gemma terms) — the one
current-quality 1024px model that is fp16-NATIVE, which matters because a
T4 has no bf16. With the text encoder quantized nf4 and model CPU offload
the peak is ~2.5GB VRAM, which coexists with vLLM at
--gpu-memory-utilization 0.70. Real CFG (guidance 4.5) means the negative
prompt actually works, so "no text/letters/watermark" has teeth here.

Every image is gradient-mapped onto the request's palette before it
leaves: luminance drives a LUT built from the palette sorted dark->light,
so the returned hero is exactly on-brand whatever hues the model dreamed.

POST /generate  {"prompt", "palette": ["#hex"...], "width", "height"} -> image/png
GET  /health    -> {"ok": true, "model": "..."}

Serving rules for a shared GPU: single worker, one generation at a time
(asyncio lock), empty_cache after every job, expandable_segments on.
"""

import asyncio
import io
import os

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
from diffusers import SanaPipeline
from fastapi import FastAPI
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel
from transformers import AutoModel, BitsAndBytesConfig

MODEL_ID = os.environ.get("SANA_MODEL_ID", "Efficient-Large-Model/Sana_600M_1024px_diffusers")
STEPS = int(os.environ.get("SANA_STEPS", "20"))
GUIDANCE = float(os.environ.get("SANA_GUIDANCE", "4.5"))
NEGATIVE = "text, letters, words, watermark, logo, typography, human faces"

app = FastAPI()
lock = asyncio.Lock()

text_encoder = AutoModel.from_pretrained(
    MODEL_ID,
    subfolder="text_encoder",
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16
    ),
    torch_dtype=torch.float16,
)
pipe = SanaPipeline.from_pretrained(
    MODEL_ID, text_encoder=text_encoder, variant="fp16", torch_dtype=torch.float16
)
pipe.vae.to(torch.float32)  # DC-AE decode is tiny; fp32 avoids fp16 banding
pipe.enable_model_cpu_offload()


class GenerateIn(BaseModel):
    prompt: str
    palette: list[str] = []
    width: int = 1024
    height: int = 1024


def parse_hex(value: str) -> tuple[int, int, int] | None:
    value = value.lstrip("#")
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return None


def gradient_map(image: Image.Image, palette: list[str]) -> Image.Image:
    """Map luminance onto the palette ramp (sorted dark to light)."""
    stops = [c for c in (parse_hex(p) for p in palette) if c is not None]
    if len(stops) < 2:
        return image
    stops.sort(key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])

    lut: list[int] = []
    for channel in range(3):
        for i in range(256):
            position = i / 255 * (len(stops) - 1)
            low = int(position)
            high = min(low + 1, len(stops) - 1)
            t = position - low
            lut.append(round(stops[low][channel] * (1 - t) + stops[high][channel] * t))

    luminance = image.convert("L")
    r = luminance.point(lut[0:256])
    g = luminance.point(lut[256:512])
    b = luminance.point(lut[512:768])
    return Image.merge("RGB", (r, g, b))


def run_pipe(body: GenerateIn) -> Image.Image:
    result = pipe(
        prompt=body.prompt,
        negative_prompt=NEGATIVE,
        height=body.height,
        width=body.width,
        guidance_scale=GUIDANCE,
        num_inference_steps=STEPS,
        use_resolution_binning=True,
    )
    return result.images[0]


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_ID}


@app.post("/generate")
async def generate(body: GenerateIn) -> Response:
    async with lock:  # one generation at a time on the shared GPU
        try:
            image = await asyncio.to_thread(run_pipe, body)
        finally:
            torch.cuda.empty_cache()

    # A solid-color output means the fp16 path glitched; better the agent's
    # procedural fallback than a black rectangle on a comp.
    extrema = image.convert("L").getextrema()
    if extrema[1] - extrema[0] < 8:
        return Response(content=b"", status_code=500)

    image = gradient_map(image, body.palette)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return Response(content=out.getvalue(), media_type="image/png")
