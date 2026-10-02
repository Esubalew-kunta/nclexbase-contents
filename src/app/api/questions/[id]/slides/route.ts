import type { NextRequest } from "next/server";
import { getQuestionById } from "@/lib/supabase/questions";
import { generateQuestionSlides } from "@/lib/export/slideBank";
import { DEFAULT_CTA_TEXT } from "@/lib/slides/chrome-copy";
import { TEMPLATES, type TemplateId } from "@/lib/slides/types";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";
// Rendering drives a real Chromium through Playwright, so this needs a
// generous ceiling; the route returns the rendered paths when it completes.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/** Renders (or re-renders) a question's TikTok slides and stores them.
 *
 * Returns 200 with the paths on success, and 422 with the recorded reason on
 * failure — a failed render is a normal, expected outcome the bank displays,
 * not a server fault, so it must not be reported as a 500. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = await getQuestionById(id);
    if (!row) return Response.json({ error: "Question not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { templateId?: string; ctaText?: string };

    const templateId = (body.templateId ?? row.template_id ?? "modern-study") as TemplateId;
    if (!TEMPLATES.some((t) => t.id === templateId)) {
      return Response.json({ error: `Unknown template "${templateId}"` }, { status: 400 });
    }

    const result = await generateQuestionSlides(row, templateId, body.ctaText ?? DEFAULT_CTA_TEXT, request.nextUrl.origin);
    return Response.json({ ok: true, templateId, count: result.count, paths: result.paths });
  } catch (err) {
    console.error("POST /api/questions/[id]/slides failed:", err);
    return Response.json({ error: errorMessage(err, "Slide render failed") }, { status: 422 });
  }
}
