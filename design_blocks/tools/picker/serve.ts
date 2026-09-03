/**
 * Blind two-up picker: serves render pairs from corpus/pairs.json on
 * localhost and appends the owner's choices to corpus/picks.jsonl.
 * The page and the API expose NOTHING about a render except its pixels —
 * image URLs are opaque per-serve tokens (no extension, no id), and every
 * already-answered pair (picked or skipped) is never served again, across
 * restarts. Dependency-free: node:http only. Runs on the Mac, never the box.
 *
 *   npx tsx tools/picker/serve.ts --corpus ./corpus --port 4321
 */

import { randomBytes } from 'node:crypto';
import { appendFileSync, createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

interface Pair {
  pair_id: string;
  render_a: string;
  render_b: string;
}

function parseArgs(argv: string[]) {
  const args = { corpus: './corpus', port: 4321 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus') args.corpus = argv[++i] ?? args.corpus;
    else if (argv[i] === '--port') args.port = Number(argv[++i]);
    else {
      console.error(`unknown flag: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

/** render_id → png path, discovered from the meta.json files. */
function loadIndex(corpusDir: string): Map<string, string> {
  const index = new Map<string, string>();
  const rendersDir = join(corpusDir, 'renders');
  if (!existsSync(rendersDir)) return index;
  for (const run of readdirSync(rendersDir)) {
    let files: string[] = [];
    try {
      files = readdirSync(join(rendersDir, run));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      const imgPath = join(rendersDir, run, f.replace(/\.meta\.json$/, '.png'));
      if (!existsSync(imgPath)) continue;
      try {
        const meta = JSON.parse(readFileSync(join(rendersDir, run, f), 'utf8')) as { render_id?: unknown };
        if (typeof meta.render_id === 'string' && !index.has(meta.render_id)) index.set(meta.render_id, imgPath);
      } catch {
        /* skip unreadable meta */
      }
    }
  }
  return index;
}

function loadDone(picksPath: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(picksPath)) return done;
  for (const line of readFileSync(picksPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { pair_id?: unknown };
      if (typeof row.pair_id === 'string') done.add(row.pair_id);
    } catch {
      /* a corrupt line never blocks the session */
    }
  }
  return done;
}

const args = parseArgs(process.argv.slice(2));
const index = loadIndex(args.corpus);
const pairsPath = join(args.corpus, 'pairs.json');
if (!existsSync(pairsPath)) {
  console.error(`${pairsPath} missing — run make-pairs first`);
  process.exit(2);
}
const allPairs = JSON.parse(readFileSync(pairsPath, 'utf8')) as Pair[];
const pairs = allPairs.filter((p) => index.has(p.render_a) && index.has(p.render_b));
if (pairs.length < allPairs.length) {
  console.warn(`[picker] ${allPairs.length - pairs.length} pairs reference renders missing from the corpus — dropped`);
}
const byId = new Map(pairs.map((p) => [p.pair_id, p]));
const picksPath = join(args.corpus, 'picks.jsonl');
const done = loadDone(picksPath);
const tokens = new Map<string, string>();

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Which design is better?</title>
<style>
 body{margin:0;background:#111;color:#eee;font:14px system-ui;display:flex;flex-direction:column;height:100vh}
 header{display:flex;justify-content:center;gap:24px;padding:10px;color:#999}
 main{flex:1;display:flex;gap:12px;padding:0 12px 12px;min-height:0}
 figure{flex:1;margin:0;display:flex;flex-direction:column;min-width:0;cursor:pointer;border:2px solid #333;border-radius:8px;overflow:hidden;background:#1a1a1a}
 figure:hover{border-color:#7c6}
 .imgwrap{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
 img{max-width:100%;max-height:100%;object-fit:contain}
 figcaption{text-align:center;padding:8px;color:#888}
 #fin{display:none;place-items:center;flex:1;font-size:22px}
 kbd{background:#333;border-radius:4px;padding:1px 6px}
</style>
</head>
<body>
<header><span id="progress">…</span><span><kbd>1</kbd> left · <kbd>2</kbd> right · <kbd>S</kbd> skip</span></header>
<main id="stage">
 <figure id="fl"><div class="imgwrap"><img id="il" alt="option 1"></div><figcaption><kbd>1</kbd></figcaption></figure>
 <figure id="fr"><div class="imgwrap"><img id="ir" alt="option 2"></div><figcaption><kbd>2</kbd></figcaption></figure>
</main>
<div id="fin">All pairs ranked — thank you! 🎉</div>
<script>
let cur = null, shownAt = 0;
function setProgress(j) { document.getElementById('progress').textContent = j.picked + ' / ' + j.total + ' ranked'; }
async function next() {
  const r = await fetch('/api/next');
  const j = await r.json();
  if (j.finished) {
    document.getElementById('stage').style.display = 'none';
    document.getElementById('fin').style.display = 'grid';
    setProgress(j);
    return;
  }
  cur = j;
  document.getElementById('il').src = j.left;
  document.getElementById('ir').src = j.right;
  shownAt = Date.now();
  setProgress(j);
}
async function send(pick) {
  if (!cur) return;
  const body = { pair_id: cur.pair_id, pick, ms: Date.now() - shownAt };
  cur = null;
  await fetch('/api/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  next();
}
document.getElementById('fl').onclick = () => send('left');
document.getElementById('fr').onclick = () => send('right');
addEventListener('keydown', (e) => {
  if (e.key === '1') send('left');
  else if (e.key === '2') send('right');
  else if (e.key === 's' || e.key === 'S') send('skip');
});
next();
</script>
</body>
</html>
`;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function nextPair(): Pair | undefined {
  return pairs.find((p) => !done.has(p.pair_id));
}

// left is always render_a, right always render_b — the a/b order inside each
// pair was already randomized by make-pairs, so sides carry no signal.
function serveNext(res: ServerResponse): void {
  const pair = nextPair();
  if (!pair) {
    json(res, 200, { finished: true, picked: done.size, total: pairs.length });
    return;
  }
  const left = randomBytes(12).toString('hex');
  const right = randomBytes(12).toString('hex');
  tokens.set(left, index.get(pair.render_a) as string);
  tokens.set(right, index.get(pair.render_b) as string);
  json(res, 200, { pair_id: pair.pair_id, left: `/img/${left}`, right: `/img/${right}`, picked: done.size, total: pairs.length });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > 10_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handlePick(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: { pair_id?: unknown; pick?: unknown; ms?: unknown };
  try {
    parsed = JSON.parse(await readBody(req)) as typeof parsed;
  } catch {
    json(res, 400, { error: 'bad json' });
    return;
  }
  const pickMap: Record<string, 'a' | 'b' | 'skip'> = { left: 'a', right: 'b', skip: 'skip' };
  const pick = typeof parsed.pick === 'string' ? pickMap[parsed.pick] : undefined;
  const pair = typeof parsed.pair_id === 'string' ? byId.get(parsed.pair_id) : undefined;
  if (!pair) {
    json(res, 404, { error: 'unknown pair' });
    return;
  }
  if (!pick) {
    json(res, 400, { error: 'pick must be left|right|skip' });
    return;
  }
  if (done.has(pair.pair_id)) {
    json(res, 200, { ok: true, duplicate: true, picked: done.size });
    return;
  }
  const row = {
    pair_id: pair.pair_id,
    render_a: pair.render_a,
    render_b: pair.render_b,
    pick,
    ms: typeof parsed.ms === 'number' && Number.isFinite(parsed.ms) ? Math.round(parsed.ms) : null,
    ts: new Date().toISOString(),
  };
  appendFileSync(picksPath, JSON.stringify(row) + '\n');
  done.add(pair.pair_id);
  json(res, 200, { ok: true, picked: done.size });
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(PAGE);
  } else if (req.method === 'GET' && url === '/api/next') {
    serveNext(res);
  } else if (req.method === 'GET' && url.startsWith('/img/')) {
    const path = tokens.get(url.slice(5));
    if (!path) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    createReadStream(path).pipe(res);
  } else if (req.method === 'POST' && url === '/api/pick') {
    void handlePick(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(args.port, '127.0.0.1', () => {
  console.log(`[picker] http://127.0.0.1:${args.port} — ${pairs.length} pairs, ${done.size} already answered`);
});
