# What the model actually returns

Captured from the live `plant_doctor_blocks` agent on 19 Aug 2026. Every block
below is a verbatim response — nothing here is invented or tidied up. If you are
designing or extending a screen for this app, design against these, because the
model's real behaviour differs from its instructions in two ways that matter.

The agent fronts Qwen3.5-4B (vision) on EC2. It is asked to reply in four
markdown sections — Diagnosis, Confidence, Why, Fix — and to bail out in a
single line when the photo has no plant in it.

## The two things the instructions get wrong

**1. It never uses the one-line bail-out.** Across every run, including photos
with no plant at all and photos too blurry to read, it answered in the full
four-section format. Refusals arrive dressed as diagnoses:

```
**Diagnosis** - Not a plant
**Confidence** - high
```

Anything that treats the Diagnosis section as a plant problem will render "Not
a plant" as a confident, green-badged diagnosis. Refusals have to be detected
by reading the diagnosis line and routed to a different panel.

**2. Its wording changes between runs of the same photo.** Two runs of the same
bicycle photo produced two different diagnosis lines — `Not a plant` and `The
photo does not show a plant` — and a third reworded the evidence again. So match
on meaning across several phrasings, not on a fixed string. The Why and Fix
prose is rewritten every run:

> The photo shows bicycles parked against a brick wall in an alleyway. There
> are no plants visible in the image.

> The image displays bicycles parked against a brick wall in an alleyway with
> cars in the background. There is no plant visible in the frame.

> The visual evidence includes a blue bicycle leaning against a brick wall,
> parked cars, and a paved alleyway. There are no plants, leaves, stems, or
> soil visible.

## Timing

Five runs, cold agent, small JPEGs (12 KB – 147 KB):

| Event | When |
| --- | --- |
| `accepted` | 0.6 – 1.0 s |
| `phase: reading` | 0.8 – 1.3 s |
| `phase: asking` | 1.8 – 2.2 s |
| `result` | 5.0 – 10.6 s |

Total was 5.0 s to 10.6 s, median about 10 s. The progress copy says "usually 8
to 25 seconds", which is honest but pessimistic at the low end. Nothing observed
came close to the 180 s hard timeout.

---

## Case 1 — an ordinary houseplant

Pilea peperomioides on a glass table in window light. 135 KB JPEG, 10.6 s.

```
**Diagnosis** - Overwatering / Root Rot

**Confidence** - high

**Why** - The leaves are uniformly pale green and slightly translucent, which is a classic sign of waterlogged roots. The plant looks somewhat "mushy" rather than crisp. There is no obvious yellowing or browning that would suggest under-watering or sunburn. The pot appears to have drainage holes, but the soil surface looks dark and potentially soggy.

**Fix** -
1. Stop watering immediately.
2. Remove the plant from its pot and gently wash the roots to remove compacted soil.
3. Inspect the roots; if they are brown, mushy, or black, trim them back to healthy white tissue.
4. Repot in fresh, well-draining soil (a mix of potting soil and perlite) in a pot with ample drainage.
5. Place in a location with bright, indirect light and allow the soil to dry out completely before the next watering.
```

Renders as the result panel. Note the Confidence section is the bare word
`high` with no explanation, so the sentence that normally sits under the
headline is absent. The panel has to survive that — roughly half of runs have
no confidence note.

## Case 2 — an unambiguous disease

Pepper foliage with white fungal patches. 147 KB JPEG, 10.3 s.

```
**Diagnosis** - Powdery Mildew

**Confidence** - high. The white, powdery patches on the leaf surface are classic symptoms of this fungal disease.

**Why** - The image clearly shows distinct, circular to irregular white spots on the underside of a leaf. These spots have a soft, dusty texture typical of powdery mildew. The leaves also appear slightly curled and distorted, which is a secondary symptom caused by the fungal growth.

**Fix** -
1.  **Prune:** Remove and discard any heavily infected leaves to reduce the fungal load.
2.  **Improve Airflow:** Space the plants out and prune the center of the bush to improve air circulation.
3.  **Water Carefully:** Water at the base of the plant in the morning to avoid wetting the foliage.
4.  **Treat:** Apply a fungicide labeled for powdery mildew on peppers (e.g., potassium bicarbonate, sulfur, or neem oil) according to the label instructions.
```

Two formatting details worth handling: the Confidence rating and its
explanation share one line and have to be split (the rating goes in the badge,
the rest becomes prose), and fix steps often open with a bold inline label that
should be flattened rather than rendered as markup.

## Case 3 — a photo too soft to read

The same Pilea downsampled to 90 px and blown back up. 79 KB JPEG, 6.2 s.

```
**Diagnosis** - Not diagnosable

**Confidence** - low

**Why** - The photo is extremely blurry and out of focus, making it impossible to identify the plant species or observe specific symptoms like leaf color, texture, or signs of pests/disease.

**Fix** - Re-shoot the photo with a steady hand, ensuring the plant is in focus and well-lit. Try zooming in on a single leaf or stem to capture clear details.
```

A refusal, not a diagnosis — routed to the message panel. The Why becomes the
body and the Fix becomes the advice, which reads far better than any generic
copy, because the model is describing this specific photo. Note the Fix here is
a single unmarked paragraph rather than a numbered list.

## Case 4 — small but legible

The same Pilea at 150 × 200 px. 12 KB JPEG, 10.2 s.

```
**Diagnosis**  
Yellowing leaves on a Pilea peperomioides (Chinese money plant).

**Confidence**  
Medium — the yellowing is visible but not severe; could be due to overwatering, under watering, or poor light.

**Why**  
The leaves are turning yellow, especially toward the base and edges, while some remain green. The plant is potted in a container that appears to have soil, and it's placed near a window with indirect light — common conditions for this species. No obvious pests or rot are visible.

**Fix**  
1. Check soil moisture: insert a finger 1–2 inches deep; water only if dry.
2. Ensure good drainage: if the pot has no holes, repot into one with drainage.
3. Provide bright, indirect light — avoid direct sun.
4. Reduce watering frequency if leaves were recently wet.
5. Observe for 2–3 weeks; if yellowing spreads or new leaves stay green, reassess.

If the photo doesn't show enough detail (e.g., soil condition, root exposure, or leaf pattern), re-shoot with close-ups of affected leaves and soil surface.
```

Three things differ from case 1. The section headers sit on their own line with
the content beneath, rather than after a dash. The diagnosis is a full sentence
ending in a full stop, so it needs trimming to work as a headline. And there is
a trailing paragraph after the numbered list — glue it onto step 5 and you get
a nonsense final step, so it belongs on its own.

The same plant read as healthy-ish at full size and as "yellowing leaves" at
thumbnail size. Resolution changes the answer, which is why the upload panel
warns when the long edge is under 400 px.

## Case 5 — nothing to diagnose

Bicycles against a brick wall. 127 KB JPEG, 5.0 s.

```
**Diagnosis** - Not a plant

**Confidence** - high

**Why** - The photo shows bicycles parked against a brick wall in an alleyway. There are no plants visible in the image.

**Fix** - Re-shoot the photo to include a plant. Ensure the plant is in focus and fully visible within the frame.
```

The fastest response of the set, and the one most likely to be mishandled: it
is a well-formed, high-confidence answer whose content is a refusal.

---

## Every state the interface can be in

Only the last four come from the model. The first five are decided in the
browser before anything is uploaded, and the network ones never reach it.

### Decided in the browser, before upload

| State | Trigger | What the user sees |
| --- | --- | --- |
| Wrong file type | Anything that is not JPEG, PNG or WebP | Coral alert: "That file type will not work — Plant Doctor reads JPEG, PNG and WebP. The file you chose is a HEIC." |
| **Over 10 MB** | `file.size > 10 * 1024 * 1024` | Coral alert: "That photo is too large — The limit is 10 MB. IMG_4821.jpg is 11.6 MB — try a smaller export or a screenshot." |
| Corrupt | Declared type is fine but the bytes will not decode | Coral alert: "That image could not be opened" |
| Several files dropped | More than one file in the drop | Amber alert, first file kept |
| Very small | Long edge under 400 px | Amber alert, upload still allowed |

The 10 MB ceiling mirrors the agent card's own limit. It is checked twice: in
the browser, so an 11.6 MB file is refused instantly without uploading a byte,
and again in the route handler, so a direct POST cannot get past it. The
browser check is the one users meet; the server check is there because the
client can be bypassed.

The first three states clear the photo and return to the drop zone. The last
two keep the photo and let the user proceed.

### Decided by the network

| State | Trigger | Panel |
| --- | --- | --- |
| Agent asleep | EC2 model unreachable, or no progress within 45 s | "The service is asleep" — neutral, offers to wake and retry |
| Connection dropped | Fetch failed mid-stream | "The connection dropped" — coral, retry keeps the photo loaded |
| Queued | Agent busy with another photo | "The model is busy" — amber, keep waiting or cancel |
| Timed out | No reply after 180 s | Stays in the progress panel with step two marked failed |

### Decided by the model

| State | Trigger | Panel |
| --- | --- | --- |
| Diagnosis | Diagnosis and Why both parse, and the diagnosis is a real problem | Result panel: headline, confidence badge, evidence, numbered fix |
| No plant | Diagnosis line means "there is no plant here" | Message panel, using the model's own description and advice |
| Not diagnosable | Diagnosis line means "I cannot read this photo" | Message panel, same treatment |
| Unparseable | Sections missing or malformed | Raw panel — the reply shown as-is rather than forced into a layout |

## If you are extending this

- Treat the Diagnosis line as untrusted. It is as likely to hold a refusal as a
  plant problem.
- Assume the Confidence note may be missing, and the Fix may be one paragraph,
  one sentence, or six numbered steps with bold labels.
- Do not fabricate content when parsing fails. The raw panel exists so that a
  weird reply is still readable; that is better than an empty result card.
- The prose is full of en dashes, em dashes and curly quotes. It is plain text
  from a model, so escape it rather than trusting it as markup.

The parser that implements all of this is `src/lib/diagnosis.ts`, and the copy
for each non-result state is in `src/lib/messages.ts`.
