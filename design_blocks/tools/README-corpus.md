# W2-1 render corpus + blind picker

Builds a corpus of the system's own renders and lets the owner blind-rank
~200 pairs in a browser. The picks (`corpus/picks.jsonl`) are the training
signal for the W2-3 VL judge calibration and the W2-4 preference head.

## The full flow

1. **Get the tools onto the box.** `design_blocks/` has never been in git —
   it is untracked on the Mac AND in the box checkout (it originally moved
   by scp), so `git pull` cannot deliver anything here. Copy exactly the
   standalone tool files and nothing else:

   ```sh
   scp -i ~/blocks.ai.pem tools/guard.ts tools/corpus-run.ts tools/corpus-briefs.json tools/start-corpus.sh \
     ec2-user@44.239.142.53:Blocks-Agent-Demos/design_blocks/tools/
   ```

   NEVER touch the box's handler.ts or lib/ — the box copy is the only
   pristine v3 baseline in existence (preserving/tracking it is W2-6
   scope) — and NEVER run `deploy/deploy.sh`, which restarts
   `design-blocks.service`.
2. **Generate on the box** (renders need the resident vLLM :8000 + embed
   :8798; the lib defaults already point at them, no env needed):

   ```sh
   ssh -i ~/blocks.ai.pem ec2-user@44.239.142.53 'sh ~/Blocks-Agent-Demos/design_blocks/tools/start-corpus.sh'
   # then: tail -f ~/design-corpus/run.log on the box
   ```

   Sequential, one handler run at a time (~6-9 min each, ~2-3 h for 20
   briefs). The guard stats `/var/log/design-blocks.log` before EVERY brief
   and waits while a live task looks in-flight (10 × 60 s, then exit 3).
   Output goes OUTSIDE the checkout (`~/design-corpus`), so the repo stays
   clean. Run it attended (nohup + tail the log).
3. **Pull the corpus to the Mac:**

   ```sh
   scp -i ~/blocks.ai.pem -r ec2-user@44.239.142.53:design-corpus ./corpus-box
   ```

4. **Merge box renders + local harvest into `./corpus`:** copy
   `corpus-box/renders/*` into `corpus/renders/`, then harvest the v3-era
   renders that only exist on the Mac (test/out is gitignored):

   ```sh
   npx tsx tools/corpus-run.ts --harvest test/out/e2e-box test/out/e2e-box-v3 test/out --out ./corpus
   ```

   Harvest is idempotent — a render whose sha1-12 is already in the corpus
   is skipped.
5. **Sample pairs and rank (Mac only — the picker never runs on the box):**

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
