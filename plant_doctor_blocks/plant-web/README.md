# plant-web

The web client for [`plant_doctor_blocks`](..), living inside the agent it calls.
One photo in, one plant diagnosis out — no login, no history, no database.

```bash
npm install
cp .env.example .env.local  # paste the same BLOCKS_API_KEY the agent uses
npm run dev                 # http://localhost:3000
```

## How it talks to the agent

The Blocks API key is server-side only. The browser posts the photo as
`multipart/form-data` to `/api/diagnose`, and that route handler is the only
place the SDK is ever loaded:

```ts
const client = await TaskClient.create({ billingMode: "free", apiKey });
const session = await client.sendMessage({
  agentName: "plant_doctor_blocks",
  requestParts: [filePart(bytes, { partId: "photo", contentType: photo.type })],
});
```

The route streams the task back as server-sent events, so the progress panel
tracks the agent's real `reportStatus` calls — "Reading the photo…" then
"Asking the model…" — rather than guessing at a spinner. Measured runs land in
5–11 seconds once the agent is awake.

## What happens when things go wrong

The agent can be asleep, busy, slow, or handed a photo with no plant in it, and
each of those gets its own screen instead of a generic error:

| Situation | How it is detected | What the user sees |
|---|---|---|
| Agent not listening | No progress event within 45s | "The service is asleep", with a retry that wakes it |
| Model already busy | `session.queued` on the RPC reply | "The model is busy", queued and waiting |
| Run exceeds the agent's ceiling | 180s with progress but no artifact | Progress panel with the second step marked failed |
| Reply misses the four sections | `parseDiagnosis` finds no Diagnosis + Why | The raw markdown, shown verbatim |
| No plant, or a photo it cannot read | The diagnosis line is a refusal | The model's own account of the photo, plus its re-shooting advice |

That last row is the one worth knowing about. The prompt tells the model to bail
out in a single line when there is no plant, and it never does — it answers in
the full four-section format with `Diagnosis: Not a plant` and high confidence.
Refusals are therefore caught by reading the diagnosis line, not by the reply
being short. [`docs/model-outputs.md`](docs/model-outputs.md) has the verbatim
responses this was built against.

Photos are checked in the browser first: type, the 10 MB ceiling, and whether
the bytes actually decode. An oversized file is refused before a byte is
uploaded; the route handler enforces the same ceiling again, since the client
can be bypassed. Dimensions, EXIF rotation, and PNG transparency are read
locally too, which is what drives the frame notes on the preview.

## Layout

- `src/app/api/diagnose/route.ts` — the only code that sees the API key
- `src/lib/diagnosis.ts` — markdown to result state, including the fallbacks
- `src/lib/photo.ts` — client-side validation and image inspection
- `src/lib/messages.ts` — the copy for every non-result outcome
- `docs/model-outputs.md` — real agent responses, and every state they produce

Built with Next.js 16, React 19, and Tailwind 4.

Part of [Blocks Agent Demos](../../README.md).

