# design_blocks

A design studio that coding agents consult **before** writing UI code —
built around deliverables the AI in the editor *cannot produce itself*.
Claude Code or Cursor sends a one-line brief over the
[Blocks](https://blocks.ai/?utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos) network and gets back **three rendered design
comps**: real typography, competing palettes, and credited bank
photography as hero imagery, rendered as full-page compositions transferred
from real reference designs. The comps are scored against a
curated reference bank (CLIP image-image — the agent *looks* at its own
options before picking), the winner is ringed on a contact sheet, and it
comes expanded into a WCAG-solved `theme.css`, a design kit, a 1024px
`hero.png`, and a composited `og.png`.

A coding model can suggest a palette; it cannot emit a PNG, render three
comps, or look at them. That's the gap this fills. The bank lives on your
own EC2 box: whatever references you ingest — images you have rights to
use, plus a one-command licensed seeder — indexed with CLIP embeddings so
a text brief finds the right anchors.

> **On scraping inspiration sites:** Dribbble and friends have no public API
> anymore, and bulk-downloading their shots to redistribute breaks their
> terms and the designers' copyright — so this demo doesn't. Point the ingest
> script at images you have instead; the direction the agent serves is mostly
> *extracted facts* (palettes, vibe tags, typography guidance) plus
> thumbnails of your own bank.

## How a brief becomes three compositions

The primary path is **reference transfer** — the reference decides the
SHAPE of the page, not just its colors:

1. **Understand** — one Qwen call turns the brief into a `ProductIntent`:
   content inventory, what each piece of data must *communicate* (never
   which widget shows it), and whether the domain offers a visual subject
   that could carry the composition (a plant, a topology graph, a map).
2. **Retrieve** — the brief is embedded (CPU CLIP sidecar) and matched
   against the bank, UI references first. Three anchors: *faithful* (best
   match), *bolder* (the structurally richest candidate — planes,
   overlaps, container breaks), *unexpected* (the most visually distant).
3. **Decompose** — Qwen-VL reads each anchor and emits a
   `DesignReferenceAnalysis`: visual masses with numeric bounding boxes,
   depth planes, overlap/occlusion pairs, container breaks, imagery
   integration, data-display *forms* ("radial ring wrapping the subject",
   never "bar chart"), and 3-8 `signaturePatterns` — each stored as an
   *observation* ("a leaf occupies ~45% of the right side") plus a
   product-neutral *transferable principle* ("one oversized domain
   subject anchors the composition"). Cached per reference at ingest.
4. **Transfer** — the composition planner receives the product intent
   plus a domain-SCRUBBED structural brief (masses lose their nouns; only
   principles survive) and emits a `CompositionSpec`: arbitrary elements
   with free-text roles, fractional frames, depth planes, and semantic
   relations — `overlaps`, `attachedTo` (data pinned to a point on a
   subject), `breaksContainer`, `offsetFrom` (deliberate misalignment),
   `encircles` (a ring that wraps a subject, split into front/back arcs).
   The spec is **validated against the analysis** — quantitative
   assertions derived from the reference (asymmetry ⇒ off-axis focal
   mass, 4 planes ⇒ real z-spread and overlaps, pinned data ⇒ an
   `attachedTo`) reject a navbar-hero-cards regression with named errors
   and one guided retry.
5. **Resolve & render** — a deterministic resolver turns the spec into
   pixel geometry, *enforcing* every declared relation (an overlap that
   doesn't overlap is a bug, not a hope), then satori + resvg render the
   full-page comp with real fonts, real imagery (the bank photograph
   matched to the brief, gradient-mapped to the palette; cutouts via the
   sidecar), ring arcs, and leader lines.
6. **Score** — deterministic structural fidelity (resolved geometry vs
   that direction's own analysis: dominance, symmetry class, depth
   utilization, realized overlaps, breaks, attachment) leads at 55%;
   CLIP measures fit to the *brief* (not the anchor — cloning the
   reference must not win); palette fidelity and a faithful-first prior
   settle ties.
7. **Critique & revise** — Qwen-VL sees the winner's annotated render
   (element ids + outlines) and verdicts every principle
   preserved/weakened/lost — structure only, never color. Claims that
   contradict resolved geometry are discarded; surviving fixes arrive as
   whitelisted ops (move/resize/setZ/addRelation...), are re-resolved,
   re-rendered, re-scored, and kept only if the structural score improved.
   Bounded (default 1 round, max 2).

The old template grammar (`lib/pagespec.ts`) survives **only as the
labeled fallback** — vLLM down, empty bank, or a spec below the usability
floor. It can no longer silently own the page: `kit.provenance` records
`compositionSource` (`reference-transfer` | `template-fallback`), the
reference id, the signature patterns used, every sanitizer repair, every
deadline shed, and which principles verifiably survived into the render.

Try the transfer machinery offline (no models needed):

```bash
npx tsx test/transfer-demo.ts   # two fixture references -> two structurally
                                # different comps for the same product, plus
                                # the validator rejecting a template spec
```

The offline test suite runs the same way — no models, no sidecars, no
network — and is what CI runs:

```bash
npm run typecheck
npm test        # quality gate, craft proxies, grammar floors
npm run smoke   # the handler on its worst path: empty bank, every sidecar down
```

Artifacts per task: `direction` (markdown), `blueprint` (the composition
walk), `composition_spec` (spec + resolved geometry), `composition_html`
(the same geometry as positioned HTML/CSS), `analysis` (the reference
decomposition), `kit` (JSON incl. provenance), `theme_css`, `comp_1/2/3`
(full-page composition previews), `comps` (contact sheet, winner ringed),
`hero`, `og`, and `board` (the matched bank references).

## Run the agent

```bash
cd design_blocks
npm install
cp .env.example .env        # then: blocks login --write-env
npm run check               # validates agent-card.json and connectivity
npm start                   # blocks run
```

Start the embedding sidecar (CPU, ~600MB CLIP ViT-B/32):

```bash
cd deploy/embed
docker build -t design-embed .
docker run -d --name design-embed --restart unless-stopped \
  -v /opt/hf-cache:/root/.cache/huggingface \
  -p 127.0.0.1:8798:8798 design-embed
```

Hero imagery needs no GPU: the handler takes the bank photograph CLIP
matched to the brief and gradient-maps it onto each direction's palette
with resvg (`lib/hero.ts`), so every comp carries a real, credited
photograph. The diffusion sidecar in `deploy/imagine` is optional and off
by default (`DESIGN_IMAGINE=1` to try it first); on a shared 15GB card it
needs vLLM relaunched at `--gpu-memory-utilization 0.70`.

### Optional: a hosted authoring model

The composition specs are the one place a 4B model shows its size. Put an
`ANTHROPIC_API_KEY` in `.env` (or `/etc/design-blocks/env` on the box) and
every authoring call — product intent, the three directions, each
CompositionSpec, the vision critique — goes to Claude (`ANTHROPIC_MODEL`,
default `claude-opus-5`) with the local model as the fallback for any call
that fails. Retrieval, rendering, scoring and the resolver are unchanged
and stay local. Leave the key empty, or set `DESIGN_LLM=local`, and the
agent runs entirely on open weights.

## Fill the bank

```bash
# Option A: your own reference images (anything you have rights to use)
npx tsx ingest/ingest.ts ~/my-inspiration-folder

# Option B: zero-effort licensed seed from Pexels (free key)
PEXELS_API_KEY=... npx tsx ingest/seed-pexels.ts
npx tsx ingest/ingest.ts ./inspo

# Option C: keyless seed from Openverse (CC0 / CC-BY imagery)
npx tsx ingest/seed-openverse.ts "botanical green leaves" "pastel gradient"
npx tsx ingest/ingest.ts ./inspo

# Option D: real page designs — screenshots of permissively licensed
# templates (shadcn/ui, Tabler, HTML5 UP...), credited per shot
bash tools/shoot-refs.sh ./inspo-ui
npx tsx ingest/ingest.ts ./inspo-ui --kind ui
```

Ingest gives every image a CLIP embedding and a palette (sidecar), a
ui-vs-photo kind (zero-shot CLIP), vibe/tags/notes from Qwen over the
local vLLM, and — most importantly — a cached **structural decomposition**
(`bank/analysis/<id>.json`) that the composition planner transfers from
at query time. It content-hashes, so re-running only adds what's new. A `credits.json` in the source folder
travels with the references into every board they appear on.

Test without any MCP client:

```bash
npx tsx trigger.ts "moody fintech dashboard, dark, technical"
# prints the direction; saves design-kit.json, design-theme.css, design-board.jpg
```

## Hook it into Claude Code and Cursor

The consumer surface is the **stock Blocks MCP server** — no custom client
code exists in this folder. Claude Code:

```bash
claude mcp add blocks-network -e BLOCKS_API_KEY=sk_... \
  -- npx -y @blocks-network/mcp-server@1.0.15
```

Cursor (`.cursor/mcp.json`) or Claude Desktop:

```json
{
  "mcpServers": {
    "blocks-network": {
      "command": "npx",
      "args": ["-y", "@blocks-network/mcp-server@1.0.15"],
      "env": { "BLOCKS_API_KEY": "sk_..." }
    }
  }
}
```

The version is pinned deliberately — test before bumping. The coding agent
gets `search_agent` (it can *find* design_blocks in the catalog),
`get_agent_card`, `send_task`, `get_task`, and `download_artifact`. Since the
brief is plain text, there is nothing to install client-side — no capture
scripts, no Playwright, no files to upload.

[`invocation-pack/`](./invocation-pack) teaches the agent *when* to ask:

| File | Goes to | What it does |
|---|---|---|
| `SKILL.md` | `.claude/skills/design-blocks/SKILL.md` | Claude Code consults the bank before building or restyling UI |
| `design-blocks.mdc` | `.cursor/rules/design-blocks.mdc` | Cursor rule, auto-attached on frontend file globs |

## The demo

[`demo-app/`](./demo-app) is a deliberately rough waitlist page. Run it
(`npm install && npm run dev`), show the "before", then in Claude Code:

> "Restyle this properly — get a design direction from the Blocks network
> first."

The agent finds `design_blocks` in the catalog, sends the brief, and the
progress lines stream into the transcript while the box works ("Searching
24 references... Matched: playful botanical pastel · warm editorial...").
The board JPEG comes back so the audience sees the moodboard itself, then
the agent links the theme, installs the fonts, swaps the emoji for real
icons, and builds to the direction. Reload — designed, not just styled.
Open the same repo in Cursor and the same agent name answers there too.

If you're pitching the network: `blocks publish` puts the agent in the
[public catalog](https://app.blocks.ai/agents?utm_source=github&utm_medium=organic_social&utm_campaign=huggingface_agents&utm_content=demos) with per-task pricing (85/15
split) — every vibe coder's session becomes a customer of your bank.

## Inputs and outputs

| | id | Type | Notes |
|---|---|---|---|
| in | `brief` | text/plain | JSON `{goal, vibe, framework, count}` or a plain sentence; `count` = refs returned (2-8, default 4) |
| out | `direction` | text/markdown | guaranteed — which comp won, why, provenance, and the apply-in-order steps |
| out | `kit` | application/json | guaranteed — provenance, winner tokens, all three directions with score parts, icons, fonts, photo, refs |
| out | `blueprint` | text/markdown | guaranteed — the build plan for the winning composition, element by element |
| out | `theme_css` | text/css | guaranteed — append-safe, WCAG-solved |
| out | `motion_css`, `motion_js` | text/css, text/javascript | guaranteed — the micro-animation kit, wired by data-attributes |
| out | `hero` | image/png | guaranteed — 1024px hero, bank photograph gradient-mapped to the palette (credit in `kit.winner.heroCredit`) |
| out | `comp_1`, `comp_2`, `comp_3` | image/png | the three full-page composition previews |
| out | `comps` | image/png | the contact sheet with scores, winner ringed |
| out | `og` | image/png | 1200×630 og:image, hero under a scrim with the headline |
| out | `stickers` | application/json | floating component SVGs in the winner's fonts and palette |
| out | `composition_spec` | application/json | the winning spec plus resolved pixel geometry |
| out | `composition_html` | text/html | the same geometry as standalone positioned HTML/CSS |
| out | `analysis` | application/json | the winning reference's structural decomposition |
| out | `board` | image/jpeg | the matched bank references (absent if the bank is empty) |

[`agent-card.json`](./agent-card.json) is the authoritative list, with the
full description of each artifact.

## Models

| Model | Role | Where | Licence |
|---|---|---|---|
| [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) | reference decomposition (vision), product intent, composition transfer, structural critique, ingest tagging | existing vLLM at 0.80 util | Apache 2.0 |
| Claude (optional, `ANTHROPIC_API_KEY`) | the same authoring calls, with Qwen as the fallback | Anthropic API | commercial API |
| [CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32) | retrieval + comp scoring | CPU sidecar, :8798 | MIT |

Hero imagery is deliberately not generated: a licensed photograph from
the bank, chosen by the same CLIP retrieval as the references and
gradient-mapped to the palette, beats what a small diffusion model paints
on a shared T4, and it ships with a credit. The optional Sana sidecar in
`deploy/imagine` remains for boxes with spare VRAM (`DESIGN_IMAGINE=1`).

Every degraded mode is graceful: no usable bank photo → procedural
imagery; embed sidecar down → keyword retrieval; vLLM down or no usable
reference decomposition → the labeled template fallback (never silent —
`kit.provenance.compositionSource` says which path ran); a composition
spec below the validation floor → that direction alone falls back; empty
bank → comps designed from the brief alone. The task never returns
nothing.

## Deploy on EC2

Mirrors the other demos: [`deploy/design-blocks.service`](./deploy/design-blocks.service)
runs `blocks run` under systemd with the key in `/etc/design-blocks/env`
(root, mode 600, outside the working tree), and
[`deploy/deploy.sh`](./deploy/deploy.sh) pulls, checks both sidecars and the
bank, and restarts. One outbound connection; no inbound ports, DNS, or TLS.

## Licences and asset terms, stated plainly

- **Blocks SDK**: `@blocks-network/sdk` ships under a custom proprietary
  licence agreement (not Apache 2.0, whatever the marketing page implies).
- **Bank content**: ingest only what you have rights to use. Seeded Pexels
  photos are licensed for this and carry their credit through to every
  board; Pexels asks for a visible "Photo by NAME on Pexels" link.
- **Icons**: Iconify search is hard-limited in code to Lucide (ISC), Tabler,
  Heroicons, Phosphor (MIT) — nothing attribution-encumbered can leak into a
  generated app.
- **Fonts**: OFL-licensed pairings via Bunny Fonts (GDPR-friendly CDN) or
  self-hosted `@fontsource/*` packages; comp rendering fetches TTFs from
  Fontsource's jsDelivr mirror and caches them on disk.
- **Hero imagery**: comes from the bank, so it inherits the bank's terms —
  the photo's credit is in `kit.winner.heroCredit` and the direction's
  footer. If you enable the optional Sana sidecar: Sana 600M weights are
  Apache 2.0, its Gemma2-2B text encoder carries Google's Gemma terms, and
  Sana-Sprint / SANA 1.5-4.8B checkpoints are NVIDIA research-licensed.
- **Comp renderer**: satori and @resvg/resvg-js are MPL-2.0 — fine as
  unmodified npm dependencies; don't vendor-modify them.
- **Privacy**: without `ANTHROPIC_API_KEY` the handler makes no hosted-LLM
  or hosted-image calls — brief in, comps out, all on your box. With the
  key, the brief, the reference analyses and the critique images go to the
  Anthropic API; the bank itself never leaves the box.
