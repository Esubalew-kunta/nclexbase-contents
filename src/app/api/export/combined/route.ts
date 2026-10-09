import type { NextRequest } from "next/server";
import { renderCombinedSlides } from "@/lib/export/render";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Renders a question's slides and returns the chosen ones (by position, as in
 *  the preview) joined side by side as a single PNG. Unlike the
 *  per-slide export this does not file anything in the question bank — it is a
 *  presentation convenience, not a new version of the question. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { question: NormalizedQuestion; templateId: TemplateId; ctaText?: string; slideIndices?: number[] };
  const { question, templateId, ctaText = "", slideIndices = [] } = body;

  try {
    const indices = [...new Set(slideIndices)].filter((i) => Number.isInteger(i) && i >= 0).sort((x, y) => x - y);
    if (indices.length < 2) {
      return Response.json({ error: "Select at least two slides to combine" }, { status: 400 });
    }
    const { buffer, names } = await renderCombinedSlides(question, templateId, ctaText, request.nextUrl.origin, indices);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="Q${question.index}-combined-${names.join("+")}.png"`,
      },
    });
  } catch (err) {
    console.error("Combined export failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}
