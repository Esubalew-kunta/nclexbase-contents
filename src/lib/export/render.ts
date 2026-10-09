import { getBrowser } from "./browser";
import { putPrintPayload, deletePrintPayload, type PrintPayload } from "./tokenStore";
import type { Page } from "playwright";
import { putPrintImage, deletePrintImage } from "./imageStore";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export interface RenderedSlide {
  buffer: Buffer;
  kind: "question" | "answer";
  isContinuation: boolean;
  /** Short, question-scoped name: Q1, Q1-2 (continuation), A1, A1-2, ... */
  filename: string;
}

/** Rendered when content cannot be made to fit a slide at all. Thrown rather
 *  than warned about: the alternative is shipping a PNG with the bottom of an
 *  answer sliced off, which looks like a bug to the audience and cannot be
 *  undone once it is posted. */
export class SlideOverflowError extends Error {
  constructor(readonly overflow: { kind: string; blockIds: string[]; tier: string }[]) {
    super(
      `Content does not fit on a slide, even at the smallest text size. ` +
        overflow.map((o) => `${o.kind} section: ${o.blockIds.join(", ")} (density "${o.tier}")`).join("; "),
    );
    this.name = "SlideOverflowError";
  }
}

/** The origin Chrome should load /print from. The request's own origin is
 *  unreliable behind a host like Render: the server binds HOSTNAME=0.0.0.0, so
 *  Next reports `https://0.0.0.0:PORT`, which is not a reachable address and
 *  speaks plain HTTP anyway (ERR_SSL_PROTOCOL_ERROR). In production the server
 *  is always in this same process, so go straight to loopback over HTTP. */
function localOrigin(requestOrigin: string): string {
  if (process.env.NODE_ENV === "production") {
    return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  }
  return requestOrigin.replace("//0.0.0.0", "//127.0.0.1");
}

/** Attached pictures are data: URLs, far too big for the URL-carried print
 *  token. Park each one server-side and point the question at it instead. */
async function withParkedImages<T>(question: NormalizedQuestion, run: (question: NormalizedQuestion) => Promise<T>): Promise<T> {
  const imageIds: string[] = [];
  const park = (image: NormalizedQuestion["image"]): NormalizedQuestion["image"] => {
    if (!image?.src.startsWith("data:")) return image;
    const id = putPrintImage(image.src);
    if (!id) return null;
    imageIds.push(id);
    return { ...image, src: `/api/print-image/${id}` };
  };
  try {
    return await run({ ...question, image: park(question.image), answerImage: park(question.answerImage) });
  } finally {
    for (const id of imageIds) deletePrintImage(id);
  }
}

/** Opens the real /print page (the exact same React templates + pagination the
 *  live preview uses) for one question, waits until it is laid out and its
 *  pictures have painted, and hands the page to `capture`. Retries once on a
 *  crashed browser/page (e.g. after the dev server itself restarted and
 *  orphaned the old Chromium process). */
async function withPrintPage<T>(payload: PrintPayload, requestOrigin: string, capture: (page: Page) => Promise<T>): Promise<T> {
  const origin = localOrigin(requestOrigin);
  let attempt = 0;
  for (;;) {
    attempt++;
    const token = putPrintPayload(payload);
    try {
      const browser = await getBrowser();
      const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
      try {
        await page.goto(`${origin}/print?token=${token}`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__READY__ === true, { timeout: 15000 });

        // Checked before screenshotting: once a block is taller than the slide it
        // will overflow no matter what, and a clipped answer is worse than no
        // image at all.
        const overflow = await page.evaluate(() => window.__OVERFLOW__ ?? []);
        if (overflow.length > 0) throw new SlideOverflowError(overflow);

        // Layout never waits on pictures (their height comes from CSS), so make
        // sure they have actually painted before the screenshots are taken.
        await page.evaluate(() => Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))));

        return await capture(page);
      } finally {
        await page.close();
      }
    } catch (err) {
      // A genuine layout failure, not a dead browser: retrying cannot help.
      if (err instanceof SlideOverflowError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 2 && /crash|closed|disconnected/i.test(message)) {
        continue; // the shared browser died mid-render, so getBrowser() will relaunch it
      }
      throw err;
    } finally {
      deletePrintPayload(token);
    }
  }
}

/** Renders every slide for one question and screenshots each slide element at
 *  its true 1080x1920 size. */
export async function renderQuestionSlides(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, requestOrigin: string): Promise<RenderedSlide[]> {
  return withParkedImages(question, (q) =>
    withPrintPage({ question: q, templateId, ctaText }, requestOrigin, async (page) => {
      const kinds = await page.evaluate(() => window.__SLIDE_KINDS__ ?? []);
      const counts: Record<string, number> = {};
      const slides: RenderedSlide[] = [];
      for (let i = 0; i < kinds.length; i++) {
        const buffer = await page.locator(`[data-slide-index="${i}"]`).screenshot({ type: "png" });
        const { kind, isContinuation } = kinds[i];
        const prefix = kind === "question" ? "Q" : "A";
        counts[kind] = (counts[kind] ?? 0) + 1;
        const occurrence = counts[kind];
        const filename = `${prefix}${q.index}${occurrence > 1 ? `-${occurrence}` : ""}.png`;
        slides.push({ buffer, kind, isContinuation, filename });
      }
      return slides;
    }),
  );
}

/** Renders the chosen slides (by position) laid out side by side and returns
 *  them as ONE picture. The side-by-side layout is done by the print page itself,
 *  so this costs a single render and a single screenshot, with no per-slide PNGs
 *  that then have to be decoded, stitched and encoded a second time. */
export async function renderCombinedSlides(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, requestOrigin: string, slideIndices: number[]): Promise<{ buffer: Buffer; names: string[] }> {
  return withParkedImages(question, (q) =>
    withPrintPage({ question: q, templateId, ctaText, combine: slideIndices }, requestOrigin, async (page) => {
      const kinds = await page.evaluate(() => window.__SLIDE_KINDS__ ?? []);
      const counts: Record<string, number> = {};
      const names = kinds.map(({ kind }) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return `${kind === "question" ? "Q" : "A"}${q.index}${counts[kind] > 1 ? `-${counts[kind]}` : ""}`;
      });
      const buffer = await page.locator("[data-combined]").screenshot({ type: "png" });
      return { buffer, names: slideIndices.map((i) => names[i]).filter(Boolean) };
    }),
  );
}
