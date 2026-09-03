#!/bin/sh
# Starts the W2-1 corpus generation on the box, detached. Safe to re-run:
# corpus-run appends new run dirs and the guard defers to live traffic
# before every brief. Never touches the service, docker, or systemd.
set -eu
cd "$HOME/Blocks-Agent-Demos/design_blocks"
mkdir -p "$HOME/design-corpus"
nohup npx tsx tools/corpus-run.ts --briefs tools/corpus-briefs.json --out "$HOME/design-corpus" > "$HOME/design-corpus/run.log" 2>&1 &
echo "started pid=$!"
