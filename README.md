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

## A note on secrets

No credentials are committed to this repo. Every demo reads its key from the
environment, `.env*` is ignored, and `.env.example` files document what you need to
supply. Agents start **private and free** on Blocks — publish only when you mean to.

## License

MIT
