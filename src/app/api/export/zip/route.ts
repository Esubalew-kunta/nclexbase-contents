import JSZip from "jszip";
import type { NextRequest } from "next/server";
import { renderQuestionSlides } from "@/lib/export/render";
import { saveRenderedQuestionToBank } from "@/lib/export/slideBank";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Zips up every selected question's slides, registering each question and its
 *  images in the question bank on the way through — the same behaviour as the
 *  single-slide export, so a batch export is not a way to produce images that
 *  the library never learns about.
 *
 *  A question whose bank save fails still contributes its PNGs to the zip: the
 *  download is the thing the user asked for and it must not be held hostage by a
 *  storage error. Only a render failure aborts, because that means the PNGs
 *  themselves are missing. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { questions: NormalizedQuestion[]; templateId: TemplateId; ctaText?: string };
  const { questions, templateId, ctaText = "" } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return Response.json({ error: "No questions provided" }, { status: 400 });
  }

  const zip = new JSZip();
  let savedCount = 0;
  const saveFailures: string[] = [];

  try {
    for (const question of questions) {
      const slides = await renderQuestionSlides(question, templateId, ctaText, request.nextUrl.origin);
      slides.forEach((slide) => {
        zip.file(slide.filename, slide.buffer);
      });
      const saved = await saveRenderedQuestionToBank(question, slides, templateId);
      if ("error" in saved) saveFailures.push(`${question.index}: ${saved.error}`);
      else savedCount++;
    }
  } catch (err) {
    console.error("ZIP export failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"NCLEXBase_Questions.zip\"",
      "X-Bank-Saved": saveFailures.length === 0 ? "true" : "partial",
      "X-Bank-Question-Id": "",
      "X-Bank-Saved-Count": String(savedCount),
      ...(saveFailures.length > 0 ? { "X-Bank-Error": saveFailures.slice(0, 3).join(" | ") } : {}),
    },
  });
}