# clip-web

The consumer side of [`clip_scout_blocks`](..). Drop a recording, watch the run,
get back three moments with timestamps you can cut against.

```bash
npm install
cp .env.example .env.local   # the same BLOCKS_API_KEY the agent uses
npm run dev                  # http://localhost:3000
```

The agent has to be running and reachable on the Blocks network, and the two
models it fronts have to be up on the GPU box — `faster-whisper` on `:8001` and
vLLM on `:8000`. See the [agent's README](../../README.md#clip_scout_blocks) for
the deploy.

## Why it takes video

Blocks caps a single task input at 25MB and a screen recording is routinely
twenty times that, so the obvious move is to reject video and ask for an audio
export. But the picture was never the payload — the transcript is what gets
ranked — so the video track is discarded in the browser and only mono Opus is
uploaded. A 40 second 1280×720 capture goes up as 67KB.

Which means the frames are still sitting in the tab, unsent, when the picks come
back. That is what the stage on the results screen is: the same object URL,
seeked to whichever clip you pressed play on. Supporting video costs one decode
and buys you the ability to watch the moment instead of reading a pair of
numbers.

## How a file becomes an upload

All of it happens in `src/lib/prepare.ts`, in the tab, before anything is sent:

1. **Read** the file through a stream, so a 400MB drop reports real progress.
2. **Decode** with `OfflineAudioContext` at 16kHz — the rate Whisper resamples
   to internally anyway — which does the downsample in the same pass that
   discards the video track, and keeps a long recording's PCM inside a few
   hundred megabytes.
3. **Encode** to Opus at 24kbps mono through WebCodecs `AudioEncoder`, packet by
   packet.
4. **Mux** those packets into Ogg (`src/lib/ogg.ts`), because neither ffmpeg nor
   Whisper will take bare Opus. Two header pages, then up to 255 packets per
   page so a 20ms frame is not paying for a 28-byte header.

At 24kbps the 25MB cap is about two and a half hours of speech, so in practice
the limit stops being the file size and starts being the model's context window.

Browsers without `AudioEncoder` fall back to 16-bit PCM in a WAV wrapper, which
hits the cap at roughly thirteen minutes. That path says so rather than
uploading something the network will reject.

## Recording instead

A take recorded in the browser needs none of that work — `MediaRecorder` already
hands back mono Opus in a container the agent accepts — so it goes up as-is.
It does get re-muxed to Ogg before the results screen, though: MediaRecorder's
WebM ships without cues, so seeking into it is unreliable, and the clip player
depends on seeking.

## The API key never reaches the browser

`TaskClient` is only ever constructed inside the Node runtime route handlers
under `src/app/api/clips/`. The prepared audio is posted to `start`, which hands
the task to the agent and returns the taskId immediately; the page then polls
`status` for snapshots until the task lands (and fires `cancel` if the user
walks away). No invocation outlives a few seconds — the task itself keeps
running on the Blocks network — which is what lets this app deploy to
serverless hosts like Netlify, where a function cannot hold a connection open
for the length of a run. The three-step panel still follows the handler's real
status updates rather than a timer; they just arrive by snapshot instead of by
stream.

A missing or rejected key is reported as a setup problem and names the file to
put it in, rather than as the generic "something failed between here and the GPU
box" — a task that was never sent cannot have failed on the box, and the first
run after a fresh clone is exactly when that copy matters most. The underlying
reason is printed verbatim for that case and for anything unclassified, since
fixed copy cannot name a cause it does not know.

## Reading the reply

The agent answers in markdown, and `src/lib/clips.ts` turns it into something
the page can seek to. It reads tolerantly — heading level, bold markers, and the
dash between the two timestamps all vary between runs of the same recording —
but a clip whose timestamps will not parse is dropped, since a clip the page
cannot seek to is not a clip. If none survive, the raw reply is shown as written
rather than forced into a layout built around a range that was never read.

Quote marks get stripped when they wrap the whole quote, because the model only
adds them about half the time and the card supplies its own typography — left in,
the same recording would look different run to run. A quote with further quotes
inside it keeps all of them: a nested pair cannot be told from two adjacent ones
without parsing the sentence, and visible punctuation beats a mangled sentence.
