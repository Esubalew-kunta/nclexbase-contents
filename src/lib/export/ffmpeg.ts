import { spawn } from "node:child_process";

// ffmpeg is a SYSTEM binary, not an npm dependency, so nothing at install time
// guarantees it exists. On a host that doesn't have it (a bare container, a
// fresh serverless image) the first video export would otherwise spend the full
// render budget drawing every frame and only then fail with a raw ENOENT,
// surfacing to the admin as an opaque 500. This module checks up front so the
// failure is immediate and says what to do about it.

export class FfmpegUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FfmpegUnavailableError";
  }
}

/** Cached so a burst of exports doesn't shell out once per request. Reset when
 * the check fails, so fixing the problem and retrying works without a restart. */
let cached: { ok: true; version: string } | { ok: false; reason: string } | null = null;

function probe(binary: string, args: string[], timeoutMs: number): Promise<{ ok: true; stdout: string } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(binary, args);
    } catch (e) {
      resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let settled = false;
    const finish = (r: { ok: true; stdout: string } | { ok: false; reason: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    // A hung binary must not hold the request open.
    const timer = setTimeout(() => {
      proc.kill();
      finish({ ok: false, reason: `${binary} did not respond within ${timeoutMs}ms` });
    }, timeoutMs);

    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.on("error", (e) => {
      const code = (e as NodeJS.ErrnoException).code;
      finish({ ok: false, reason: code === "ENOENT" ? `${binary} is not installed or not on PATH` : e.message });
    });
    proc.on("close", (code) => {
      if (code === 0) finish({ ok: true, stdout });
      else finish({ ok: false, reason: `${binary} exited with code ${code}` });
    });
  });
}

export interface FfmpegStatus {
  ok: boolean;
  version?: string;
  reason?: string;
  /** The ffmpeg binary actually used, so an override is visible in the UI. */
  binary: string;
}

function binary(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

/** The ffmpeg binary actually used, honouring an FFMPEG_PATH override so a
 * host that keeps ffmpeg somewhere unusual can still export video. */
export function ffmpegBinary(): string {
  return binary();
}

export async function checkFfmpeg(force = false): Promise<FfmpegStatus> {
  if (cached && !force) return { ...cached, binary: binary() };

  const bin = binary();
  const result = await probe(bin, ["-version"], 5000);

  if (!result.ok) {
    cached = { ok: false, reason: result.reason };
    return { ok: false, reason: result.reason, binary: bin };
  }

  // "ffmpeg version 6.1.1 ..." — the first line carries the useful part.
  const version = result.stdout.split("\n")[0]?.trim().slice(0, 120) || "unknown version";
  cached = { ok: true, version };
  return { ok: true, version, binary: bin };
}

/** Throws a clear, actionable error when ffmpeg is unusable. Called before any
 * rendering work so the admin isn't left waiting for a doomed export. */
export async function assertFfmpeg(): Promise<void> {
  const status = await checkFfmpeg();
  if (!status.ok) {
    throw new FfmpegUnavailableError(
      `Video export needs ffmpeg, which isn't available on this server (${status.reason}). ` +
        `Install it and make sure it's on PATH${process.env.FFMPEG_PATH ? ", or fix the FFMPEG_PATH override" : ""}. ` +
        `PNG and ZIP export work without it.`,
    );
  }
}
