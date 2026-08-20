import type { MessageSpec } from "@/components/MessagePanel";
import type { Refusal } from "./diagnosis";
import type { FailureKind } from "./protocol";

/** Keeps the model's own words in the copy without letting them run away. */
function quote(text: string, limit = 260): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/**
 * A timeout is deliberately absent: it keeps the progress panel, with the
 * second step marked failed, rather than replacing it with a message.
 */
export const FAILURE_MESSAGES: Record<
  Exclude<FailureKind, "timeout">,
  MessageSpec
> = {
  offline: {
    glyph: "z",
    tone: "neutral",
    title: "The service is asleep",
    body: "The model server is switched off between sessions to keep costs down. This is normal — waking it takes a moment.",
    list: [],
    primary: "Wake it and retry",
    secondary: "Start over",
  },
  network: {
    glyph: "!",
    tone: "coral",
    title: "The connection dropped",
    body: "The request was cut off partway through. Your photo is still loaded here, so retrying does not re-upload it.",
    list: [],
    primary: "Retry",
    secondary: "Start over",
  },
  generic: {
    glyph: "!",
    tone: "coral",
    title: "That request failed",
    body: "Something went wrong between here and the model. No details came back that would help you, so the useful move is to send the same photo again.",
    list: [],
    primary: "Retry",
    secondary: "Start over",
  },
};

export const QUEUED_MESSAGE: MessageSpec = {
  glyph: "•",
  tone: "amber",
  title: "The model is busy",
  body: "It handles one photo at a time and is finishing another request. Your photo is queued and will run next — nothing is lost.",
  list: [],
  primary: "Keep waiting",
  secondary: "Cancel",
};

const NO_PLANT_TIPS = [
  "Frame the plant so it fills most of the shot",
  "Include the leaves — that is where symptoms show",
  "Avoid photos of soil, pots or rooms alone",
];

const NOT_DIAGNOSABLE_TIPS = [
  "Hold still or brace the phone, then tap to focus",
  "Step back so the whole plant is in frame",
  "Shoot in daylight rather than under a lamp",
];

export function noPlantMessage(refusal: Refusal): MessageSpec {
  return {
    glyph: "?",
    tone: "neutral",
    title: "No plant in this photo",
    body: quote(refusal.body),
    list: refusal.tips.length > 0 ? refusal.tips : NO_PLANT_TIPS,
    primary: "Choose another photo",
    secondary: "Start over",
  };
}

export function notDiagnosableMessage(refusal: Refusal): MessageSpec {
  return {
    glyph: "!",
    tone: "amber",
    title: "This photo cannot be read",
    body: quote(refusal.body),
    list: refusal.tips.length > 0 ? refusal.tips : NOT_DIAGNOSABLE_TIPS,
    primary: "Try another photo",
    secondary: "Start over",
  };
}

export function unreadableMessage(reply: string): MessageSpec {
  return {
    glyph: "!",
    tone: "coral",
    title: "That photo did not make it through",
    body: `The agent received the request but could not open the image: “${quote(reply)}”`,
    list: [],
    primary: "Try again",
    secondary: "Start over",
  };
}
