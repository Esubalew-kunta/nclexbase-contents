import JSZip from "jszip";
import type { NextRequest } from "next/server";
import { renderQuestionSlides } from "@/lib/export/render";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { questions: NormalizedQuestion[]; templateId: TemplateId; ctaText?: string };
  const { questions, templateId, ctaText = "" } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return Response.json({ error: "No questions provided" }, { status: 400 });
  }

  const zip = new JSZip();

  try {
    for (const question of questions) {
      const slides = await renderQuestionSlides(question, templateId, ctaText, request.nextUrl.origin);
      slides.forEach((slide) => {
        zip.file(slide.filename, slide.buffer);
      });
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
    },
  });
}
