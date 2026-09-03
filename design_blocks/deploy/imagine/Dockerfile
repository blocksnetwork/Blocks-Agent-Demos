# Design Blocks image-generation sidecar — Sana 600M, GPU, ~2.5GB peak.
#
#   docker build -t design-imagine .
#   docker run -d --name design-imagine --restart unless-stopped \
#     --runtime nvidia --gpus all \
#     -v /opt/hf-cache:/root/.cache/huggingface \
#     -p 127.0.0.1:8797:8797 design-imagine
#
# Coexists with vLLM ONLY if vLLM runs at --gpu-memory-utilization 0.70
# (down from 0.80) — see the README's deploy section. Bind localhost only.

FROM pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

RUN pip install --no-cache-dir \
    "diffusers>=0.32" "transformers>=4.44" accelerate bitsandbytes \
    fastapi "uvicorn[standard]" pillow sentencepiece

WORKDIR /app
COPY service.py .

EXPOSE 8797
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8797"]
