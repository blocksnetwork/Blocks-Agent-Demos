#!/usr/bin/env bash
# Pull the latest code and restart the agent. Run on the EC2 box.
set -euo pipefail

PROJECT="${PROJECT:-/home/ec2-user/plant_doctor_blocks}"
export PATH="/usr/local/bin:$PATH"

cd "$PROJECT"

if [ -d .git ]; then
  git pull --ff-only
fi

npm install --omit=dev

# .env holds BLOCKS_API_KEY and is deliberately not in the repo.
if ! grep -qE '^BLOCKS_API_KEY=.+' .env 2>/dev/null; then
  echo "BLOCKS_API_KEY missing from $PROJECT/.env — the agent cannot connect." >&2
  exit 1
fi

blocks check

if ! curl -sf -o /dev/null --max-time 5 http://localhost:8000/v1/models; then
  echo "Warning: vLLM is not answering on :8000. Start it before serving traffic." >&2
fi

sudo systemctl restart plant-doctor
sleep 3
systemctl is-active plant-doctor
