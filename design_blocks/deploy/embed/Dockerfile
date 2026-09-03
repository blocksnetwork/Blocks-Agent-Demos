# Design Blocks embedding sidecar — CPU only, CLIP ViT-B/32.
#
#   docker build -t design-embed .
#   docker run -d --name design-embed --restart unless-stopped \
#     -v /opt/hf-cache:/root/.cache/huggingface \
#     -p 127.0.0.1:8798:8798 design-embed
#
# Bind to 127.0.0.1 only: the agent and the ingest script reach it over
# localhost, nothing about it needs to face the internet.

FROM python:3.12-slim

RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir \
    "transformers>=4.44" pillow fastapi "uvicorn[standard]" python-multipart

# rembg (U2Net, CPU) powers /cutout — the quality path for turning
# generated subjects into transparent foreground cutouts. service.py
# degrades to corner flood-fill if this layer is removed, but flood-fill
# is only reliable on flat backgrounds. Weights (~170MB) download on
# first use into the mounted hf-cache volume so they survive rebuilds.
RUN pip install --no-cache-dir rembg onnxruntime
ENV U2NET_HOME=/root/.cache/huggingface/u2net

WORKDIR /app
COPY service.py .

EXPOSE 8798
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8798"]
