import 'dotenv/config';
import { TaskClient, filePartFromPath, decodeInlineArtifact } from '@blocks-network/sdk';
import type { ProgressEvent, ArtifactEvent, TerminalEvent } from '@blocks-network/sdk';

/**
 * Send a plant photo to the agent and print the diagnosis.
 * Usage: npx tsx trigger.ts ./sample-plant.jpg
 */
async function main() {
  const photo = process.argv[2] ?? './sample-plant.jpg';

  const client = await TaskClient.create({
    billingMode: 'free',
    apiKey: process.env.BLOCKS_API_KEY!,
  });

  const session = await client.sendMessage({
    agentName: 'plant_doctor_blocks',
    requestParts: [
      await filePartFromPath(photo, { partId: 'photo', contentType: 'image/jpeg' }),
    ],
  });

  console.log(`Sent ${photo} -- task ${session.taskId}`);

  session.onProgress((event: ProgressEvent) => {
    console.log('[progress]', event.message ?? event.progress ?? '');
  });
  session.onArtifact(async (event: ArtifactEvent) => {
    const ref = event.artifactRef;
    const bytes =
      ref.kind === 'inline' && ref.data
        ? decodeInlineArtifact(ref)
        : (await session.downloadArtifact(ref)).data;
    console.log('\n' + new TextDecoder().decode(bytes) + '\n');
  });
  session.onTerminal((_event: TerminalEvent) => {
    console.log('[done]');
    session.close();
    client.destroy();
    process.exit(0);
  });
}

main().catch(console.error);
