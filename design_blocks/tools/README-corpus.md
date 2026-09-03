# Render corpus + blind picker

Builds a corpus of the design agent's own renders and lets a human blind-rank
pairs of them in a browser. The picks (`corpus/picks.jsonl`) are the training
signal for calibrating the vision-model judge and the preference head — the
data that decides whether `DESIGN_CRAFT_WEIGHT` ever leaves zero.

Everything under `corpus/` and `corpus-box/` is gitignored: renders, pairs,
and picks stay local.

## The full flow

The commands below use two placeholders — set them for your own deployment:

```sh
export BOX=ec2-user@<your-box-hostname>     # the machine running design_blocks
export KEY=~/.ssh/<your-key>.pem            # its SSH key
```

1. **Get the tools onto the box.** They ship with the repo, so `git pull`
   on the box is enough. If the box checkout must stay pinned, copy only
   the standalone tool files — never `handler.ts` or `lib/`, which the
   running service depends on:

   ```sh
   scp -i "$KEY" tools/guard.ts tools/corpus-run.ts tools/corpus-briefs.json tools/start-corpus.sh \
     "$BOX":Blocks-Agent-Demos/design_blocks/tools/
   ```

   Do not run `deploy/deploy.sh` for this — it restarts
   `design-blocks.service`.
2. **Generate on the box** (renders need the resident vLLM on `:8000` and
   the embed sidecar on `:8798`; the lib defaults already point at them, so
   no env is needed):

   ```sh
   ssh -i "$KEY" "$BOX" 'sh ~/Blocks-Agent-Demos/design_blocks/tools/start-corpus.sh'
   # then: tail -f ~/design-corpus/run.log on the box
   ```

   Sequential, one handler run at a time (~6-9 min each, ~2-3 h for 20
   briefs). The guard stats `/var/log/design-blocks.log` before EVERY brief
   and waits while a live task looks in-flight (10 × 60 s, then exit 3).
   Output goes OUTSIDE the checkout (`~/design-corpus`), so the repo stays
   clean. Run it attended (nohup + tail the log).
3. **Pull the corpus to your machine:**

   ```sh
   scp -i "$KEY" -r "$BOX":design-corpus ./corpus-box
   ```

4. **Merge box renders + local harvest into `./corpus`:** copy
   `corpus-box/renders/*` into `corpus/renders/`, then harvest any renders
   that only exist locally (`test/out` is gitignored):

   ```sh
   npx tsx tools/corpus-run.ts --harvest test/out --out ./corpus
   ```

   Harvest is idempotent — a render whose sha1-12 is already in the corpus
   is skipped.
5. **Sample pairs and rank (locally — the picker never runs on the box):**

   ```sh
   npx tsx tools/make-pairs.ts --corpus ./corpus --n 200
   npx tsx tools/picker/serve.ts --corpus ./corpus --port 4321
   # open http://127.0.0.1:4321 — keys: 1 left, 2 right, S skip
   ```

   Progress survives restarts: answered pairs (picked or skipped) are never
   re-served. To re-rank a skipped pair, delete its line from
   `corpus/picks.jsonl` and restart the server.

## File formats

- `renders/<run>/comp-N.png` + `comp-N.meta.json` — one render + its meta:
  `{render_id, brief_id, brief, stance, compositionSource, referenceId,
  score, parts, origin, createdAt}`. `render_id` is sha1-12 of the png
  bytes (same convention as bank ids). Nulls are fine for harvested and
  template-fallback renders. comp-N stance is positional
  (faithful/bolder/unexpected); kit `directions` is score-ranked, which is
  why meta is matched by stance, not index.
- `pairs.json` — `[{pair_id, render_a, render_b}]`, same-brief pairs all
  included first, a/b order and file order shuffled (seeded, default 42).
- `picks.jsonl` — one line per answer:
  `{pair_id, render_a, render_b, pick: "a"|"b"|"skip", ms, ts}`.

## Blindness

The picker page and `/api/next` expose pair_id, opaque `/img/<token>` URLs
(no extension), and progress counts — nothing else. No filename, stance,
score, brief, or referenceId ever reaches the DOM. Verify any change with:

```sh
curl -s http://127.0.0.1:4321/api/next | grep -cE 'stance|score|referenceId|comp-|\.png'   # must print 0
curl -s http://127.0.0.1:4321/ | grep -cE 'stance|score|referenceId|comp-|\.png'           # must print 0
```

## Keep the eval suite clean

`tools/corpus-briefs.json` is picker-training material. The W2-5 frozen
eval briefs must be a DISJOINT set — never reuse these ids or briefs there.

## Box safety

Shared production T4 (vLLM :8000, Whisper :8001, embed :8798). corpus-run
adds one node process and zero GPU allocations of its own; writes are
confined to `~/design-corpus`; code moves via `git pull` only; no npm
installs on the box (the tools use node builtins only); never touch
docker/systemd/deploy.sh.
