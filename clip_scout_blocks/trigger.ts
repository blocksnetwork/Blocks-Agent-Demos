import 'dotenv/config';
import { execFile } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { TaskClient, filePartFromPath, decodeInlineArtifact } from '@blocks-network/sdk';
import type { ProgressEvent, ArtifactEvent, TerminalEvent } from '@blocks-network/sdk';

const run = promisify(execFile);

// Blocks caps a single input at 25MB. Speech at 64kbps mono is ~28MB/hour, so
// anything longer than roughly 50 minutes needs splitting rather than squeezing.
const MAX_UPLOAD = 25 * 1024 * 1024;
const HEADROOM = 24 * 1024 * 1024;

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** Strip video and re-encode to 64kbps mono so long recordings fit the cap. */
async function extractAudio(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'clip-scout-'));
  const out = join(dir, `${basename(source, extname(source))}.m4a`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k', out]);
  return out;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Send a recording to the agent and print the clip picks.
 * Usage: npx tsx trigger.ts ./recording.mp4
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx trigger.ts ./recording.mp4');
    process.exit(1);
  }

  const ext = extname(input).toLowerCase();
  const size = (await stat(input)).size;
  const isVideo = VIDEO_EXTS.has(ext);
  const needsWork = isVideo || size > HEADROOM;

  let upload = input;
  let contentType = AUDIO_TYPES[ext] ?? 'audio/mp4';

  if (needsWork) {
    if (!(await hasFfmpeg())) {
      console.error(
        `${input} is ${mb(size)}${isVideo ? ' of video' : ''} and needs its audio extracted first.\n` +
        `Install ffmpeg (brew install ffmpeg), or do it yourself:\n\n` +
        `  ffmpeg -i "${input}" -vn -ac 1 -ar 16000 -c:a aac -b:a 64k out.m4a\n`,
      );
      process.exit(1);
    }
    console.log(`Extracting audio from ${mb(size)} source...`);
    upload = await extractAudio(input);
    contentType = 'audio/mp4';
    console.log(`  -> ${mb((await stat(upload)).size)}`);
  }

  const finalSize = (await stat(upload)).size;
  if (finalSize > MAX_UPLOAD) {
    console.error(
      `Still ${mb(finalSize)} after compression, over the ${mb(MAX_UPLOAD)} limit. ` +
      `Split the recording and run it in halves.`,
    );
    process.exit(1);
  }

  const client = await TaskClient.create({
    billingMode: 'free',
    apiKey: process.env.BLOCKS_API_KEY!,
  });

  const session = await client.sendMessage({
    agentName: 'hook_finder_blocks',
    requestParts: [
      await filePartFromPath(upload, { partId: 'recording', contentType }),
    ],
  });

  console.log(`Sent ${mb(finalSize)} -- task ${session.taskId}`);

  // onTerminal can fire while onArtifact is still awaiting the download,
  // so hold the artifact work and drain it before exiting.
  const pending: Array<Promise<void>> = [];

  session.onProgress((event: ProgressEvent) => {
    console.log('[progress]', event.message ?? event.progress ?? '');
  });

  session.onArtifact((event: ArtifactEvent) => {
    pending.push(
      (async () => {
        const ref = event.artifactRef;
        const bytes =
          ref.kind === 'inline' && ref.data
            ? decodeInlineArtifact(ref)
            : (await session.downloadArtifact(ref)).data;
        console.log('\n' + new TextDecoder().decode(bytes) + '\n');
      })(),
    );
  });

  session.onTerminal(async (event: TerminalEvent) => {
    await Promise.allSettled(pending);
    if (pending.length === 0) {
      console.log('[warning] task ended with no artifact');
      console.log('[terminal]', JSON.stringify(event, null, 2));
    }
    console.log('[done]');
    session.close();
    client.destroy();
    process.exit(0);
  });
}

main().catch(console.error);
