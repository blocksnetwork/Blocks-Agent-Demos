#!/usr/bin/env bash
# Pull the latest code and restart the agent. Run on the EC2 box.
set -euo pipefail

PROJECT="${PROJECT:-/home/ec2-user/Blocks-Agent-Demos/design_blocks}"
export PATH="/usr/local/bin:$PATH"

cd "$PROJECT"

if [ -d ../.git ]; then
  git -C .. pull --ff-only
fi

npm install --omit=dev

# The key lives in /etc/design-blocks/env, outside the repo, and is injected
# by systemd. blocks check needs it in the environment too.
if [ -r /etc/design-blocks/env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/design-blocks/env
  set +a
else
  echo "/etc/design-blocks/env is not readable — the agent cannot connect." >&2
  exit 1
fi

blocks check

if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8798/health; then
  echo "Warning: the embed sidecar is not answering on :8798. Retrieval falls back to keywords and boards lose their contact sheet." >&2
elif ! curl -sf --max-time 5 http://127.0.0.1:8798/openapi.json | grep -q '/cutout'; then
  echo "Warning: the embed sidecar predates /cutout — rebuild it (cd deploy/embed && docker build -t design-embed . && docker rm -f design-embed && docker run -d --name design-embed --restart unless-stopped -v /opt/hf-cache:/root/.cache/huggingface -p 127.0.0.1:8798:8798 design-embed). Cutout subjects degrade to contained imagery until then." >&2
fi

if [ "${DESIGN_IMAGINE:-}" = "1" ] && ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8797/health; then
  echo "Warning: DESIGN_IMAGINE=1 but the imagine sidecar is not answering on :8797. Heroes come from bank photography instead." >&2
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Note: no ANTHROPIC_API_KEY in /etc/design-blocks/env — composition specs are authored by the local 4B model." >&2
fi

if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8000/v1/models; then
  echo "Warning: vLLM is not answering on :8000. Directions fall back to deterministic specs; ingest tagging needs it." >&2
fi

if [ ! -f bank/index.json ]; then
  echo "Warning: bank/index.json is missing — the bank is empty. Seed and ingest before demoing." >&2
else
  refs=$(ls bank/refs 2>/dev/null | wc -l)
  analyses=$(ls bank/analysis 2>/dev/null | wc -l)
  if [ "$analyses" -lt "$refs" ]; then
    echo "Warning: only $analyses/$refs references carry a structural decomposition — composition transfer falls back for the rest. Run: npx tsx ingest/retag.ts (with vLLM up)." >&2
  fi
fi

sudo systemctl restart design-blocks
sleep 3
systemctl is-active design-blocks
