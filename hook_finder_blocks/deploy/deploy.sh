#!/usr/bin/env bash
# Pull the latest code and restart the agent. Run on the EC2 box.
set -euo pipefail

PROJECT="${PROJECT:-/home/ec2-user/Blocks-Agent-Demos/hook_finder_blocks}"
export PATH="/usr/local/bin:$PATH"

cd "$PROJECT"

if [ -d ../.git ]; then
  git -C .. pull --ff-only
fi

npm install --omit=dev

# The key lives in /etc/hook-finder/env, outside the repo, and is injected by
# systemd. blocks check needs it in the environment too.
if [ -r /etc/hook-finder/env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/hook-finder/env
  set +a
else
  echo "/etc/hook-finder/env is not readable — the agent cannot connect." >&2
  exit 1
fi

blocks check

if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8000/v1/models; then
  echo "Warning: vLLM is not answering on :8000." >&2
fi

if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8001/health; then
  echo "Warning: whisper service is not answering on :8001." >&2
fi

sudo systemctl restart hook-finder
sleep 3
systemctl is-active hook-finder
