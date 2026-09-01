# Blocks Agent Demos

Working example agents built on the [Blocks](https://blocks.ai) network with the
`@blocks-network/sdk` — each one wraps an open-weights model running on your own
hardware and makes it callable, discoverable, and billable.

**Try them live — no GPU or setup required:**

- 🌱 [`plant_doctor_blocks`](https://app.blocks.ai/agents/plant_doctor_blocks?&utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos) — send a plant photo, get a diagnosis
- 🎬 [`hook_finder_blocks`](https://app.blocks.ai/agents/hook_finder_blocks?&utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos) — send a recording, get your three strongest clips (the hosted Clip Scout agent)

## Why Blocks

Blocks is a communication and routing layer, not compute. Your agent runs on your
infrastructure; Blocks connects it to the world but never takes custody of it. In
practice that means your agent opens **one outbound connection** — no inbound
ports, no DNS, no SSL certificates, no load balancer, and no auth system to build.

## What's in this repo

| Demo | What it does | Stack |
|---|---|---|
| [`plant_doctor_blocks`](./plant_doctor_blocks) | Send a plant photo, get a markdown diagnosis with confidence, visual evidence, and a numbered fix | Blocks provider agent, TypeScript, vLLM + Qwen3.5-4B vision |
| [`plant_doctor_blocks/plant-web`](./plant_doctor_blocks/plant-web) | The consumer side of the same agent: upload one photo, watch the run, read the diagnosis | Next.js 16, React 19, Tailwind 4 |
| [`clip_scout_blocks`](./clip_scout_blocks) | Send a recording, get the three strongest short-form clips with timestamps, verbatim quotes, and captions | Blocks provider agent, TypeScript, faster-whisper + vLLM |
| [`clip_scout_blocks/clip-web`](./clip_scout_blocks/clip-web) | The consumer side: drop audio or video, watch the run, play each pick against the footage | Next.js 16, React 19, Tailwind 4, WebCodecs |
| [`design_blocks`](./design_blocks) | Claude Code / Cursor send a one-line brief and get back three rendered design comps with GPU-generated hero imagery, scored against a curated reference bank — winner expanded into theme.css, hero.png, og.png | Blocks provider agent, TypeScript, vLLM + Qwen3.5-4B, Sana 600M, CLIP scoring, satori/resvg |

## Requirements

- Node 22+ (the Blocks CLI needs Node ≥ 22 or Python ≥ 3.12)
- The Blocks CLI and an account — `blocks login --write-env`
- For `plant_doctor_blocks`: a GPU with ~10GB of free VRAM, or any reachable
  OpenAI-compatible endpoint via `VLLM_URL`
- For `clip_scout_blocks`: the same endpoint plus ~1.5GB more VRAM for Whisper,
  and `ffmpeg` locally to extract audio before upload — `clip-web` needs neither,
  since the browser does the extraction
- For `design_blocks`: the same endpoint plus the CLIP embedding sidecar, which
  runs on CPU and costs no VRAM at all; the coding-agent side needs only the
  stock `@blocks-network/mcp-server` — the brief is plain text, nothing to install

## Running the demos

Each demo is self-contained — pick one and follow its steps.

### plant_doctor_blocks

**Live on Blocks:** [`plant_doctor_blocks`](https://app.blocks.ai/agents/plant_doctor_blocks?&utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos)

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
handler, which is the only place `TaskClient` is constructed. The start route
returns the taskId immediately and the page polls a status route for snapshots,
so no invocation lasts more than a few seconds — which is what lets the app run
on serverless hosts like Netlify — while the progress panel still follows the
agent's real status updates.

```bash
cd plant_doctor_blocks/plant-web
npm install
cp .env.example .env.local  # the same BLOCKS_API_KEY the agent uses
npm run dev                 # http://localhost:3000
```

### clip_scout_blocks

**Live on Blocks:** [`hook_finder_blocks`](https://app.blocks.ai/agents/hook_finder_blocks?&utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos)

Two models in one handler. The uploaded recording goes to a small faster-whisper
service for timestamped transcription, and the transcript goes to the same vLLM
server the plant doctor uses, which ranks it into three clips worth posting.

```bash
cd clip_scout_blocks
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

[`deploy/whisper/`](./clip_scout_blocks/deploy/whisper) builds the transcription
service. On a 15GB card it coexists with the 4B vision model: run vLLM at
`--gpu-memory-utilization 0.80` and Whisper in `int8_float16`, which leaves both
resident with room to spare.

```bash
cd clip_scout_blocks/deploy/whisper
docker build -t whisper-svc .
docker run -d --name whisper --restart unless-stopped \
  --runtime nvidia --gpus all \
  -v /opt/hf-cache:/root/.cache/huggingface \
  -p 127.0.0.1:8001:8001 whisper-svc
```

### clip_scout_blocks/clip-web

The consumer side of Clip Scout, and the reason video is worth accepting at
all. Blocks caps a task input at 25MB and a screen recording is routinely twenty
times that — but the picture was never the payload, so the browser strips the
video track, downmixes to mono Opus and uploads only that. A 40-second 720p
capture goes up as 67KB.

The frames never leave the tab, which is what makes the results screen work:
each pick plays against the footage it came from, seeked to its own timestamp.

```bash
cd clip_scout_blocks/clip-web
npm install
cp .env.example .env.local  # the same BLOCKS_API_KEY the agent uses
npm run dev                 # http://localhost:3000
```

Encoding is WebCodecs plus a small Ogg muxer, so there is no ffmpeg.wasm payload
and no server-side transcode — see [its README](./clip_scout_blocks/clip-web)
for how a file becomes an upload. You can also record straight into the page,
which skips the conversion entirely since `MediaRecorder` already produces Opus.

### design_blocks

The demo for vibe-coding sessions: instead of a human uploading a file, the
consumer is **Claude Code or Cursor itself**, calling in mid-session through the
stock `@blocks-network/mcp-server`. Before writing any UI code, the coding agent
sends a one-line brief and gets back **three rendered design comps** — real
typography, competing palettes, hero imagery generated by Sana on the GPU and
gradient-mapped to the exact token hexes — scored with CLIP against a reference
bank you curate, the winner ringed on a contact sheet and expanded into a
WCAG-solved `theme.css`, kit, `hero.png`, and `og.png`. The point is the
deliverables a coding model cannot make alone: it can't emit a PNG, and it
can't look at three options before choosing. No custom client code exists —
discovery, tasks, progress, and artifacts are all the stock Blocks MCP tools.

```bash
cd design_blocks
npm install
cp .env.example .env        # then: blocks login --write-env
npm run check
npm start                   # blocks run
```

[Its README](./design_blocks) has the Claude Code / Cursor hook-up one-liners,
the bank seeding/ingest commands, and the demo script.

## The models

Nothing here calls a hosted API. The agents run open-weights models on hardware
you control, under licences that permit commercial use, and they share a single
GPU between them.

| Model | Role | Served by | Licence |
|---|---|---|---|
| [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) | Vision diagnosis, clip ranking, reference tagging, design direction | [vLLM](https://github.com/vllm-project/vllm) | Apache 2.0 |
| [Whisper large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo) | Timestamped transcription | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT |
| [CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32) | Brief→reference retrieval, comp scoring | CPU sidecar (transformers) | MIT |
| [Sana 600M](https://huggingface.co/Efficient-Large-Model/Sana_600M_1024px_diffusers) | Hero image generation for design comps | GPU sidecar (diffusers), ~2.5GB peak | Apache 2.0 |

**Qwen3.5-4B** does both language jobs. It is a vision-language model
(`image-text-to-text`), so `plant_doctor_blocks` sends it the photo directly,
while `clip_scout_blocks` uses the same weights as a text model to rank a
transcript. It is served here with a 16,384-token context, which is what bounds
how much transcript Clip Scout can weigh in one pass — and therefore why the
handler trims a long recording from the middle rather than truncating the end.

**Whisper large-v3-turbo** does the transcription, and the segment timings it
returns are what every clip timestamp is ultimately built from — including the
block boundaries described above, which is why they land on real pauses. Credit
where it is due: the model is OpenAI's, from [Radford et al.,
2022](https://arxiv.org/abs/2212.04356). `faster-whisper` does not load those
weights directly, though; it resolves `large-v3-turbo` to a
[CTranslate2](https://github.com/OpenNMT/CTranslate2) conversion of them,
[`mobiuslabsgmbh/faster-whisper-large-v3-turbo`](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo),
which is what the container actually downloads. Running that in `int8_float16` is
what lets transcription sit alongside the 4B model on one card.

Neither agent is bound to these choices. `VLLM_MODEL` and `WHISPER_MODEL` are
read from the environment, and `VLLM_URL` can point at any OpenAI-compatible
endpoint, so swapping in a larger model — or one you host elsewhere — needs no
code change.

## A note on secrets

No credentials are committed to this repo. Every demo reads its key from the
environment, `.env*` is ignored, and `.env.example` files document what you need to
supply. Agents start **private and free** on Blocks — publish only when you mean to.

On a deployed box the key belongs outside the working tree entirely. The systemd
units read an `EnvironmentFile` at `/etc/<agent>/env`, owned by root and mode 600,
so pulling — or even deleting and re-cloning — can never overwrite or expose it.

## License

MIT

