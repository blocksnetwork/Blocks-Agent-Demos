#!/usr/bin/env bash
# On the EC2 box: relabel the seeded photography as `photo` and ingest a
# folder of page-design screenshots as `ui`, using the same environment
# the agent runs under (/etc/design-blocks/env carries the sidecar URLs
# and the optional ANTHROPIC_API_KEY). Run with sudo, then hand the bank
# back to the service user.
#
#   sudo bash tools/box-ingest.sh [./inspo-ui]
set -euo pipefail

PROJECT="${PROJECT:-/home/ec2-user/Blocks-Agent-Demos/design_blocks}"
SRC="${1:-./inspo-ui}"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

set -a
# shellcheck disable=SC1091
. /etc/design-blocks/env
set +a

cd "$PROJECT"
npx tsx tools/set-kind.ts --kind photo --source openverse
npx tsx tools/set-kind.ts --kind photo --source pexels
npx tsx ingest/ingest.ts "$SRC" --kind ui
chown -R ec2-user:ec2-user bank "$SRC" 2>/dev/null || true
