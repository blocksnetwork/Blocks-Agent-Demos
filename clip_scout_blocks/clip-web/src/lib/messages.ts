import type { FailureKind } from "./protocol";

export interface Message {
  title: string;
  body: string;
  primary: string;
}

/**
 * One fixed wording per failure kind. Each says what happened and what the
 * person can do about it — "offline" is the only one where the answer is
 * genuinely "wait", so it is the only one that says so.
 */
export const FAILURE_MESSAGES: Record<FailureKind, Message> = {
  config: {
    title: "This page is not wired up yet.",
    body: "The server could not authenticate with Blocks, so the task was never sent. Put the agent's key in clip-web/.env.local as BLOCKS_API_KEY and restart the dev server. Nothing about your recording is wrong.",
    primary: "Try again",
  },
  offline: {
    title: "The models are not answering.",
    body: "Clip Scout runs transcription and ranking on one GPU box. Right now that box is not picking tasks up, so there is nothing to send this to. Your recording never left this tab.",
    primary: "Try again",
  },
  network: {
    title: "The connection dropped.",
    body: "The upload started but did not finish. Nothing was lost — the audio is still prepared and ready to send.",
    primary: "Send it again",
  },
  timeout: {
    title: "It stalled partway through.",
    body: "Transcription usually runs about twenty times faster than realtime, so a fifteen-minute silence means the run is stuck rather than slow. Retrying picks a fresh slot.",
    primary: "Try again",
  },
  nospeech: {
    title: "There is no speech in this one.",
    body: "The transcriber found no words at all. If the recording has music or room tone but nobody talking, there is nothing to pull a hook out of. Check that you captured the right track.",
    primary: "Pick another file",
  },
  toolong: {
    title: "This recording is too long to rank in one pass.",
    body: "The transcript overran what the model can read at once. Split the recording in half and run the halves separately — each will get its own three picks.",
    primary: "Pick another file",
  },
  generic: {
    title: "That run did not finish.",
    body: "Something failed between here and the GPU box, and the agent did not say what. Running it again is usually enough.",
    primary: "Try again",
  },
};

export const QUEUED_MESSAGE: Message = {
  title: "Waiting behind another run.",
  body: "The agent takes one recording at a time and something is already in front of yours. It will start on its own the moment the box is free.",
  primary: "Keep waiting",
};

export function preparationMessage(detail: string): Message {
  return {
    title: "That file could not be prepared.",
    body: detail,
    primary: "Pick another file",
  };
}

/** The handler answering its own input failures. Its wording beats ours. */
export function agentMessage(detail: string): Message {
  return {
    title: "The agent could not use that recording.",
    body: detail,
    primary: "Pick another file",
  };
}
