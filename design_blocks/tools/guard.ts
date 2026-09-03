/**
 * Live-traffic guard shared by every W2 tool that adds load to the box:
 * the design-blocks service logs to /var/log/design-blocks.log, so a
 * recent mtime means a real task is (or just was) in flight and batch
 * work must wait. Only the mtime is consulted — the log is never read,
 * so it works even when the log itself is root-readable only.
 */

import { statSync } from 'node:fs';

export interface GuardOptions {
  logPath: string;
  windowSec: number;
  sleepMs: number;
  maxChecks: number;
}

export const GUARD_DEFAULTS: GuardOptions = {
  logPath: '/var/log/design-blocks.log',
  windowSec: 300,
  sleepMs: 60_000,
  maxChecks: 10,
};

export function guardOptionsFromArgv(argv: string[]): GuardOptions {
  const opts = { ...GUARD_DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--guard-log') opts.logPath = argv[++i] ?? opts.logPath;
    else if (argv[i] === '--guard-window') opts.windowSec = Number(argv[++i]);
    else if (argv[i] === '--guard-sleep-ms') opts.sleepMs = Number(argv[++i]);
  }
  return opts;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once the box looks quiet; exits the process with code 3 when it
 * still looks busy after maxChecks. A failed stat (missing log, non-box
 * machine) warns and proceeds — an unknown mtime is not evidence of live
 * traffic, and refusing to run on the Mac would be wrong.
 */
export async function waitForQuietBox(opts: GuardOptions): Promise<void> {
  for (let check = 1; check <= opts.maxChecks; check++) {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(opts.logPath).mtimeMs;
    } catch (err) {
      console.warn(`[guard] cannot stat ${opts.logPath} (${(err as { code?: string }).code ?? 'error'}) — proceeding`);
      return;
    }
    const ageSec = (Date.now() - mtimeMs) / 1000;
    if (ageSec >= opts.windowSec) return;
    console.log(
      `[guard] live traffic ${Math.round(ageSec)}s ago (< ${opts.windowSec}s window) — waiting ${opts.sleepMs}ms (check ${check}/${opts.maxChecks})`,
    );
    await sleep(opts.sleepMs);
  }
  console.error(`[guard] box still busy after ${opts.maxChecks} checks — refusing to add load (exit 3)`);
  process.exit(3);
}
