import type { NextRequest } from "next/server";
import { renderQuestionSlides } from "@/lib/export/render";
import { saveRenderedQuestionToBank } from "@/lib/export/slideBank";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Renders one slide and returns it as a PNG — while also registering the
 *  question and its full slide set in the question bank, so generating an image
 *  is the same act as adding the question to the library.
 *
 *  The save happens after the bytes exist and is best-effort: if Supabase is
 *  unreachable the download still succeeds, and the response says the save was
 *  skipped rather than failing a request the user already got what they came for.
 *  `X-Bank-Saved` / `X-Bank-Question-Id` let the client say so without changing
 *  the response from a PNG to JSON. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { question: NormalizedQuestion; templateId: TemplateId; slideIndex: number; ctaText?: string };
  const { question, templateId, slideIndex, ctaText = "" } = body;

  try {
    const slides = await renderQuestionSlides(question, templateId, ctaText, request.nextUrl.origin);
    const slide = slides[slideIndex];
    if (!slide) {
      return Response.json({ error: "slideIndex out of range" }, { status: 400 });
    }

    const saved = await saveRenderedQuestionToBank(question, slides, templateId);

    return new Response(new Uint8Array(slide.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${slide.filename}"`,
        "X-Bank-Saved": "error" in saved ? "failed" : "true",
        ...("questionId" in saved ? { "X-Bank-Question-Id": saved.questionId, "X-Bank-Slide-Count": String(saved.slideCount) } : {}),
        ...("error" in saved ? { "X-Bank-Error": saved.error } : {}),
      },
    });
  } catch (err) {
    console.error("PNG export failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}