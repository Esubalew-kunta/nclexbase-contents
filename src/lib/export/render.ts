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

/** Renders every slide for one question through the real /print page (the
 * exact same React templates + pagination the live preview uses) and
 * screenshots each slide element at its true 1080x1920 size. Retries once on
 * a crashed browser/page (e.g. after the dev server itself restarted and
 * orphaned the old Chromium process). */
export async function renderQuestionSlides(question: NormalizedQuestion, templateId: TemplateId, ctaText: string, origin: string): Promise<RenderedSlide[]> {
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
