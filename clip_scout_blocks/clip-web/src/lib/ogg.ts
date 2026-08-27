/**
 * A minimal Ogg Opus muxer.
 *
 * WebCodecs hands back bare Opus packets, and neither ffmpeg nor Whisper will
 * take those without a container. Ogg is the one Opus was designed for and the
 * only one small enough to write by hand: two header pages, then the packets,
 * with a granule position on each page so decoders can report a duration.
 *
 * Spec references are RFC 3533 (Ogg) and RFC 7845 (Ogg Opus).
 */

const OGG_CAPTURE = 0x4f676753; // "OggS"

const FLAG_BOS = 0x02;
const FLAG_EOS = 0x04;

/** Ogg's CRC is the plain MSB-first CRC-32, init 0, no reflection, no final xor. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

/**
 * How many 48kHz samples a packet decodes to, read off its TOC byte.
 *
 * Deriving this rather than assuming 20ms frames means the muxer stays correct
 * whatever frame duration the browser's encoder decides to use.
 */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length < 1) return 0;

  const toc = packet[0];
  const config = toc >> 3;
  const code = toc & 0x03;

  let frameMs: number;
  if (config < 12) {
    frameMs = [10, 20, 40, 60][config % 4];
  } else if (config < 16) {
    frameMs = [10, 20][(config - 12) % 2];
  } else {
    frameMs = [2.5, 5, 10, 20][(config - 16) % 4];
  }

  let frames: number;
  if (code === 0) frames = 1;
  else if (code === 1 || code === 2) frames = 2;
  else frames = packet.length >= 2 ? packet[1] & 0x3f : 1;

  return Math.round(frameMs * 48 * frames);
}

function opusHead(channels: number, sampleRate: number, preSkip: number): Uint8Array {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // "OpusHead"
  head[8] = 1; // version
  head[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, sampleRate, true);
  view.setInt16(16, 0, true); // output gain
  head[18] = 0; // channel mapping family
  return head;
}

function opusTags(vendor: string): Uint8Array {
  const encoded = new TextEncoder().encode(vendor);
  const tags = new Uint8Array(8 + 4 + encoded.length + 4);
  const view = new DataView(tags.buffer);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // "OpusTags"
  view.setUint32(8, encoded.length, true);
  tags.set(encoded, 12);
  view.setUint32(12 + encoded.length, 0, true); // no user comments
  return tags;
}

/**
 * Accumulates Opus packets and emits Ogg pages.
 *
 * Packets are held until the page's 255-segment table is full rather than
 * flushed one per page: a page per 20ms packet would add a 28-byte header to
 * every 60 bytes of speech, inflating the upload by a third.
 */
export class OggOpusWriter {
  private readonly serial: number;
  private readonly pages: Uint8Array[] = [];
  private pageIndex = 0;

  /** Packets held for the page currently being built. */
  private queue: Uint8Array[] = [];
  private queueSegments = 0;

  /** Cumulative 48kHz samples, which is what a granule position counts. */
  private granule = 0;

  constructor(
    private readonly channels: number,
    private readonly sampleRate: number,
    private readonly preSkip = 0,
  ) {
    // A random serial keeps concatenated streams distinguishable, which is
    // what the field is for even though we only ever write one.
    this.serial = Math.floor(Math.random() * 0xffffffff) >>> 0;

    this.writePage([opusHead(channels, sampleRate, preSkip)], 0, FLAG_BOS);
    this.writePage([opusTags("clip-scout")], 0, 0);
  }

  add(packet: Uint8Array): void {
    const segments = Math.floor(packet.length / 255) + 1;

    if (this.queueSegments + segments > 255) this.flushQueue(0);

    this.queue.push(packet);
    this.queueSegments += segments;
    this.granule += opusPacketSamples(packet);
  }

  /** Closes the stream and returns it as an `audio/ogg` blob. */
  finish(): Blob {
    this.flushQueue(FLAG_EOS);
    // Blob copies the views, so the page list can be discarded after this.
    return new Blob(this.pages as BlobPart[], { type: "audio/ogg" });
  }

  /** 48kHz samples written so far, excluding the encoder's pre-skip. */
  get samples(): number {
    return Math.max(0, this.granule - this.preSkip);
  }

  private flushQueue(flags: number): void {
    // An empty final page would still need writing when it carries the EOS
    // flag, so that the stream is terminated rather than merely truncated.
    if (this.queue.length === 0 && flags === 0) return;
    this.writePage(this.queue, this.granule, flags);
    this.queue = [];
    this.queueSegments = 0;
  }

  private writePage(packets: Uint8Array[], granule: number, flags: number): void {
    const lacing: number[] = [];
    let payloadLength = 0;

    for (const packet of packets) {
      let remaining = packet.length;
      while (remaining >= 255) {
        lacing.push(255);
        remaining -= 255;
      }
      // Always terminate, including with a 0 when the length is a multiple of
      // 255 — otherwise the decoder waits for a continuation that never comes.
      lacing.push(remaining);
      payloadLength += packet.length;
    }

    const page = new Uint8Array(27 + lacing.length + payloadLength);
    const view = new DataView(page.buffer);

    view.setUint32(0, OGG_CAPTURE, false);
    page[4] = 0; // stream structure version
    page[5] = flags;
    // Granule positions are 64-bit; a 32-bit pair covers 24 million hours.
    view.setUint32(6, granule >>> 0, true);
    view.setUint32(10, Math.floor(granule / 0x100000000), true);
    view.setUint32(14, this.serial, true);
    view.setUint32(18, this.pageIndex++, true);
    view.setUint32(22, 0, true); // CRC placeholder, filled in below
    page[26] = lacing.length;
    page.set(lacing, 27);

    let offset = 27 + lacing.length;
    for (const packet of packets) {
      page.set(packet, offset);
      offset += packet.length;
    }

    view.setUint32(22, crc32(page), true);
    this.pages.push(page);
  }
}
