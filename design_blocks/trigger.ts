import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { TaskClient, textPart, decodeInlineArtifact } from '@blocks-network/sdk';
import type { ProgressEvent, ArtifactEvent, TerminalEvent } from '@blocks-network/sdk';

/**
 * Ask the agent for a design direction and lay the artifacts out where a
 * human can read them.
 *
 *   npx tsx trigger.ts "playful waitlist page for a plant-care app"
 *   npx tsx trigger.ts '{"goal":"fintech dashboard","vibe":"dark, technical","count":6}'
 */

const FILE_NAMES: Record<string, string> = {
  kit: 'design-kit.json',
  blueprint: 'design-blueprint.md',
  composition_spec: 'composition-spec.json',
  composition_html: 'composition.html',
  analysis: 'reference-analysis.json',
  theme_css: 'design-theme.css',
  motion_css: 'design-motion.css',
  motion_js: 'design-motion.js',
  stickers: 'design-stickers.json',
  comp_1: 'comp-1.png',
  comp_2: 'comp-2.png',
  comp_3: 'comp-3.png',
  comps: 'comps.png',
  hero: 'hero.png',
  og: 'og.png',
  board: 'design-board.jpg',
};

async function main() {
  const brief = process.argv[2];
  if (!brief) {
    console.error('Usage: npx tsx trigger.ts "what you are about to build"');
    process.exit(1);
  }

  const client = await TaskClient.create({
    billingMode: 'free',
    apiKey: process.env.BLOCKS_API_KEY!,
  });

  const session = await client.sendMessage({
    agentName: 'design_blocks',
    requestParts: [textPart(brief, 'brief')],
  });

  console.log(`Sent brief -- task ${session.taskId}`);

  // onTerminal can fire while onArtifact is still awaiting a download,
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

        const fileName = FILE_NAMES[event.outputId ?? ''];
        if (fileName) {
          await writeFile(fileName, bytes);
          console.log(`[saved] ${fileName} (${bytes.length}B)`);
        } else {
          console.log('\n' + new TextDecoder().decode(bytes) + '\n');
        }
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
