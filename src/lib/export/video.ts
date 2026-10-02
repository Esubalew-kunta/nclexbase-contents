import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBrowser } from "./browser";
import { putPrintPayload, deletePrintPayload } from "./tokenStore";
import { assertFfmpeg, ffmpegBinary, FfmpegUnavailableError } from "./ffmpeg";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export interface VideoTimings {
  /** Total seconds the question is on screen, countdown included. */
  questionSeconds: number;
  countdownSeconds: number;
  answerSeconds: number;
}

interface CapturedFrames {
  questionBuffers: Buffer[];
  countdownBuffers: Buffer[]; // counts down to 1, one buffer per second
  answerBuffers: Buffer[];
}

async function captureFrames(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, countdownSeconds: number, origin: string): Promise<CapturedFrames> {
  const token = putPrintPayload({ question, templateId, ctaText, countdownSeconds });
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  try {
    await page.goto(`${origin}/print?token=${token}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__READY__ === true, { timeout: 15000 });

    const kinds = await page.evaluate(() => window.__SLIDE_KINDS__ ?? []);
    const countdownCount = await page.evaluate(() => window.__COUNTDOWN_COUNT__ ?? 0);

    const questionBuffers: Buffer[] = [];
    const answerBuffers: Buffer[] = [];
    for (let i = 0; i < kinds.length; i++) {
      const buf = await page.locator(`[data-slide-index="${i}"]`).screenshot({ type: "png" });
      (kinds[i].kind === "question" ? questionBuffers : answerBuffers).push(buf);
    }

    const countdownBuffers: Buffer[] = [];
    for (let i = 0; i < countdownCount; i++) {
      const buf = await page.locator(`[data-countdown-frame="${i}"]`).screenshot({ type: "png" });
      countdownBuffers.push(buf);
    }

    return { questionBuffers, countdownBuffers, answerBuffers };
  } finally {
    await page.close();
    deletePrintPayload(token);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => {
      const code = (e as NodeJS.ErrnoException).code;
      reject(new FfmpegUnavailableError(code === "ENOENT" ? `ffmpeg is not installed or not on PATH: ${e.message}` : e.message));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

/** Renders a question into an MP4 short: the question slide(s) for
 * `questionSeconds` (the final `countdownSeconds` of which show a small
 * countdown badge), then the answer slide(s) for `answerSeconds`. Built from
 * the exact same PNG frames the image exporter produces — no separate
 * rendering path, so the video can never drift from the carousel's look. */
export async function renderQuestionVideo(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, timings: VideoTimings, origin: string): Promise<Buffer> {
  const { questionSeconds, countdownSeconds, answerSeconds } = timings;

  // Checked before any rendering: otherwise a missing ffmpeg costs the admin a
  // full render (tens of seconds of drawing frames that are then discarded)
  // only to fail at the very end.
  await assertFfmpeg();

  const frames = await captureFrames(question, templateId, ctaText, countdownSeconds, origin);

  const workDir = await mkdtemp(join(tmpdir(), "nclexbase-video-"));
  try {
    const plan: { path: string; duration: number }[] = [];
    let frameIdx = 0;

    const writeFrame = async (buf: Buffer) => {
      const path = join(workDir, `f${frameIdx++}.png`);
      await writeFile(path, buf);
      return path;
    };

    // Question slide(s): the plain duration minus the countdown, split
    // evenly if there's more than one (a continuation slide).
    const plainQuestionSeconds = Math.max(questionSeconds - countdownSeconds, 1);
    const perQuestionSlide = plainQuestionSeconds / frames.questionBuffers.length;
    for (const buf of frames.questionBuffers) {
      plan.push({ path: await writeFrame(buf), duration: perQuestionSlide });
    }

    // Countdown overlay, one frame per second, on top of the last question slide.
    for (const buf of frames.countdownBuffers) {
      plan.push({ path: await writeFrame(buf), duration: 1 });
    }

    // Answer slide(s), duration split evenly across however many there are.
    const perAnswerSlide = answerSeconds / frames.answerBuffers.length;
    for (const buf of frames.answerBuffers) {
      plan.push({ path: await writeFrame(buf), duration: perAnswerSlide });
    }

    // Each frame becomes its own looped input clipped to an exact duration,
    // then concatenated with the `concat` filter — the concat *demuxer*'s
    // per-entry duration handling is unreliable (the final entry's duration
    // is frequently misapplied), so inputs + filter is the robust choice.
    const inputArgs: string[] = [];
    for (const f of plan) {
      inputArgs.push("-loop", "1", "-t", String(f.duration), "-i", f.path);
    }
    const filterInputs = plan.map((_, i) => `[${i}:v]`).join("");
    const filterComplex = `${filterInputs}concat=n=${plan.length}:v=1:a=0[outv]`;

    const outputPath = join(workDir, "out.mp4");
    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[outv]",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
