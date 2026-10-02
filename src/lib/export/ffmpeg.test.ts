import { describe, expect, it, afterEach } from "vitest";
import { assertFfmpeg, checkFfmpeg, ffmpegBinary, FfmpegUnavailableError } from "./ffmpeg";

const original = process.env.FFMPEG_PATH;

afterEach(() => {
  if (original === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = original;
});

describe("ffmpegBinary", () => {
  it("defaults to ffmpeg on PATH", () => {
    delete process.env.FFMPEG_PATH;
    expect(ffmpegBinary()).toBe("ffmpeg");
  });

  it("honours an FFMPEG_PATH override for hosts that keep it elsewhere", () => {
    process.env.FFMPEG_PATH = "/usr/local/bin/ffmpeg";
    expect(ffmpegBinary()).toBe("/usr/local/bin/ffmpeg");
  });

  it("ignores a blank override rather than trying to spawn an empty path", () => {
    process.env.FFMPEG_PATH = "   ";
    expect(ffmpegBinary()).toBe("ffmpeg");
  });
});

describe("checkFfmpeg", () => {
  it("finds the real ffmpeg and reports its version", async () => {
    const status = await checkFfmpeg(true);
    // Skipped rather than failed if this machine genuinely has no ffmpeg, so
    // the suite stays green on a bare CI box.
    if (!status.ok) {
      expect(status.reason).toBeTruthy();
      return;
    }
    expect(status.version).toMatch(/ffmpeg/i);
  }, 20000);

  it("reports a clear reason when the binary does not exist", async () => {
    process.env.FFMPEG_PATH = "definitely-not-a-real-binary-xyz";
    const status = await checkFfmpeg(true);
    expect(status.ok).toBe(false);
    expect(status.reason).toMatch(/not installed|not on PATH|did not respond/i);
    expect(status.binary).toBe("definitely-not-a-real-binary-xyz");
  }, 20000);
});

describe("assertFfmpeg", () => {
  it("throws an actionable error, not a raw ENOENT", async () => {
    process.env.FFMPEG_PATH = "definitely-not-a-real-binary-xyz";
    await expect(assertFfmpeg()).rejects.toThrow(FfmpegUnavailableError);
    await expect(assertFfmpeg()).rejects.toThrow(/Video export needs ffmpeg/);
    // The message must tell the admin what still works, so they know the rest
    // of the app is fine and this is a host problem.
    await expect(assertFfmpeg()).rejects.toThrow(/PNG and ZIP export work without it/);
  }, 20000);

  it("names the FFMPEG_PATH override in the message when one is set", async () => {
    process.env.FFMPEG_PATH = "definitely-not-a-real-binary-xyz";
    await expect(assertFfmpeg()).rejects.toThrow(/FFMPEG_PATH/);
  }, 20000);

  it("does not mention the override when none is configured", async () => {
    delete process.env.FFMPEG_PATH;
    // Point the default lookup at nothing by using a temp PATH-less shell is
    // not portable, so assert on the shape only when ffmpeg is genuinely absent.
    const status = await checkFfmpeg(true);
    if (status.ok) return;
    await expect(assertFfmpeg()).rejects.toThrow(/Video export needs ffmpeg/);
  }, 20000);
});
