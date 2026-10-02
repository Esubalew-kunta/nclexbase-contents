import type { NextRequest } from "next/server";
import { renderQuestionSlides } from "@/lib/export/render";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { question: NormalizedQuestion; templateId: TemplateId; slideIndex: number; ctaText?: string };
  const { question, templateId, slideIndex, ctaText = "" } = body;

  try {
    const slides = await renderQuestionSlides(question, templateId, ctaText, request.nextUrl.origin);
    const slide = slides[slideIndex];
    if (!slide) {
      return Response.json({ error: "slideIndex out of range" }, { status: 400 });
    }

    return new Response(new Uint8Array(slide.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${slide.filename}"`,
      },
    });
  } catch (err) {
    console.error("PNG export failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}
