# Blocks Agent Demos

Working example agents built on the [Blocks](https://blocks.ai) network with the
`@blocks-network/sdk` — each one wraps an open-weights model running on your own
hardware and makes it callable, discoverable, and billable.

Blocks is a communication and routing layer, not compute. Your agent runs on your
infrastructure; Blocks connects it to the world but never takes custody of it. In
practice that means your agent opens **one outbound connection** — no inbound
ports, no DNS, no SSL certificates, no load balancer, and no auth system to build.

## Demos

| Demo | What it does | Stack |
|---|---|---|
| [`plant_doctor_blocks`](./plant_doctor_blocks) | Send a plant photo, get a markdown diagnosis with confidence, visual evidence, and a numbered fix | Blocks provider agent, TypeScript, vLLM + Qwen3.5-4B vision |
| [`plant_doctor_blocks/plant-web`](./plant_doctor_blocks/plant-web) | The consumer side of the same agent: upload one photo, watch the run, read the diagnosis | Next.js 16, React 19, Tailwind 4 |
| [`hook_finder_blocks`](./hook_finder_blocks) | Send a recording, get the three strongest short-form clips with timestamps, verbatim quotes, and captions | Blocks provider agent, TypeScript, faster-whisper + vLLM |
| [`spin-web`](./spin-web) | Picks a demo idea at random by category and maps each to an open-weights model that fits a single GPU | Next.js 16, React 19, Tailwind 4 |

### plant_doctor_blocks

A complete provider agent in about 100 lines. The handler receives a task, downloads
the uploaded image, forwards it to an OpenAI-compatible vLLM server on `localhost`,
and returns the diagnosis as a markdown artifact.

```bash
cd plant_doctor_blocks
npm install
cp .env.example .env        # then: blocks login --write-env
npm run check               # validates agent-card.json and connectivity
npm start                   # blocks run
```

Call it from a second terminal:

```bash
npx tsx trigger.ts ./sample-plant.jpg
```

The agent expects vLLM to already be serving a vision model locally:

```bash
docker run --runtime nvidia --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 --ipc=host \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen3.5-4B \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192
```

Bind vLLM to `127.0.0.1` only. The agent reaches it over localhost, so nothing about
it needs to face the internet. [`deploy/`](./plant_doctor_blocks/deploy) has a systemd
unit and a pull-and-restart script for running the agent on an EC2 GPU box.

### plant_doctor_blocks/plant-web

The other half of the plant doctor, and the reason it lives inside the agent's
folder: a Next.js front end that calls that one agent as a consumer. The API key never reaches the browser — the photo is posted to a route
handler, which is the only place `TaskClient` is constructed, and the task is
streamed back to the page as server-sent events so the progress panel follows the
agent's real status updates.

```bash
cd plant_doctor_blocks/plant-web
npm install
cp .env.example .env.local  # the same BLOCKS_API_KEY the agent uses
npm run dev                 # http://localhost:3000
```

### hook_finder_blocks

Two models in one handler. The uploaded recording goes to a small faster-whisper
service for timestamped transcription, and the transcript goes to the same vLLM
server the plant doctor uses, which ranks it into three clips worth posting.

```bash
cd hook_finder_blocks
npm install
cp .env.example .env        # then: blocks login --write-env
npm run check
npm start                   # blocks run
```

```bash
npx tsx trigger.ts ./recording.mp4
```

Blocks caps a single input at 25MB, so `trigger.ts` strips the video and re-encodes
the audio to 64kbps mono before uploading — that fits about an hour of speech.
It needs `ffmpeg` on your machine; audio files already under the cap skip the step.

[`deploy/whisper/`](./hook_finder_blocks/deploy/whisper) builds the transcription
service. On a 15GB card it coexists with the 4B vision model: run vLLM at
`--gpu-memory-utilization 0.80` and Whisper in `int8_float16`, which leaves both
resident with room to spare.

```bash
cd hook_finder_blocks/deploy/whisper
docker build -t whisper-svc .
docker run -d --name whisper --restart unless-stopped \
  --runtime nvidia --gpus all \
  -v /opt/hf-cache:/root/.cache/huggingface \
  -p 127.0.0.1:8001:8001 whisper-svc
```

### spin-web

A one-page web UI for choosing what to build next. Twelve categories, each with
product ideas paired to a specific open-weights model and its VRAM footprint.

```bash
cd spin-web
npm install
npm run dev                 # http://localhost:3000
```

## Requirements

- Node 22+ (the Blocks CLI needs Node ≥ 22 or Python ≥ 3.12)
- The Blocks CLI and an account — `blocks login --write-env`
- For `plant_doctor_blocks`: a GPU with ~10GB of free VRAM, or any reachable
  OpenAI-compatible endpoint via `VLLM_URL`
- For `hook_finder_blocks`: the same endpoint plus ~1.5GB more VRAM for Whisper,
  and `ffmpeg` locally to extract audio before upload

## A note on secrets

No credentials are committed to this repo. Every demo reads its key from the
environment, `.env*` is ignored, and `.env.example` files document what you need to
supply. Agents start **private and free** on Blocks — publish only when you mean to.

On a deployed box the key belongs outside the working tree entirely. The systemd
units read an `EnvironmentFile` at `/etc/<agent>/env`, owned by root and mode 600,
so pulling — or even deleting and re-cloning — can never overwrite or expose it.

## License

MIT

