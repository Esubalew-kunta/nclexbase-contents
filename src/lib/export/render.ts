import { getBrowser } from "./browser";
import { putPrintPayload, deletePrintPayload } from "./tokenStore";
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

/** Renders every slide for one question through the real /print page (the
 *  exact same React templates + pagination the live preview uses) and
 *  screenshots each slide element at its true 1080x1920 size. Retries once on
 *  a crashed browser/page (e.g. after the dev server itself restarted and
 *  orphaned the old Chromium process). */
export async function renderQuestionSlides(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, requestOrigin: string): Promise<RenderedSlide[]> {
  const origin = localOrigin(requestOrigin);
  let attempt = 0;
  for (;;) {
    attempt++;
    const token = putPrintPayload({ question, templateId, ctaText });
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

        const kinds = await page.evaluate(() => window.__SLIDE_KINDS__ ?? []);
        const counts: Record<string, number> = {};
        const slides: RenderedSlide[] = [];
        for (let i = 0; i < kinds.length; i++) {
          const buffer = await page.locator(`[data-slide-index="${i}"]`).screenshot({ type: "png" });
          const { kind, isContinuation } = kinds[i];
          const prefix = kind === "question" ? "Q" : "A";
          counts[kind] = (counts[kind] ?? 0) + 1;
          const occurrence = counts[kind];
          const filename = `${prefix}${question.index}${occurrence > 1 ? `-${occurrence}` : ""}.png`;
          slides.push({ buffer, kind, isContinuation, filename });
        }
        return slides;
      } finally {
        await page.close();
      }
    } catch (err) {
      // A genuine layout failure, not a dead browser: retrying cannot help.
      if (err instanceof SlideOverflowError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < 2 && /crash|closed|disconnected/i.test(message)) {
        continue; // the shared browser died mid-render — getBrowser() will relaunch it
      }
      throw err;
    } finally {
      deletePrintPayload(token);
    }
  }
}
