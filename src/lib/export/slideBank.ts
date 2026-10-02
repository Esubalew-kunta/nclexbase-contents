import { errorMessage } from "@/lib/errorMessage";
import { renderQuestionSlides } from "@/lib/export/render";
import { DEFAULT_CTA_TEXT } from "@/lib/slides/chrome-copy";
import type { TemplateId } from "@/lib/slides/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { removeQuestionSlidesByPrefix, uploadQuestionSlides } from "@/lib/supabase/storage";
import { rowToNormalizedQuestion } from "@/lib/supabase/questions";
import type { NclexQuestionRow } from "@/lib/supabase/schema-types";

// Server-only. Renders a stored question's slides to PNGs, stores them in
// Storage, and records the outcome on the question row so the bank can show
// what's ready, what's still rendering, and what failed and why.

/** Slides are rendered with the same CTA text the generator uses by default, so
 * a question's stored image matches what the admin would have exported by hand
 * from the generator screen. */
const DEFAULT_CTA = DEFAULT_CTA_TEXT;

async function setSlideState(
  questionId: string,
  patch: { slide_status: string; template_id?: string; slide_paths?: string[] | null; slide_error?: string | null; slide_rendered_at?: string | null },
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("nclex_questions").update(patch).eq("id", questionId);
  if (error) throw error;
}

/** Renders and stores every slide for one question.
 *
 * Progress is written to the row before the render starts, so a request that
 * dies mid-render (server restart, timeout) leaves a visible 'rendering' state
 * the admin can retry, rather than a question that silently never gets an
 * image. Any failure is recorded on the row too, so the failure reason is
 * visible in the bank instead of only in server logs. */
export async function generateQuestionSlides(
  row: NclexQuestionRow,
  templateId: TemplateId,
  ctaText: string,
  origin: string,
): Promise<{ paths: string[]; count: number }> {
  await setSlideState(row.id, {
    slide_status: "rendering",
    slide_error: null,
    template_id: templateId,
  });

  try {
    const question = rowToNormalizedQuestion(row);
    // renderQuestionSlides names files from question.index, which is 0 for a
    // stored row; give it a stable per-question index so file names stay
    // predictable and a re-render overwrites the same object paths.
    const rendered = await renderQuestionSlides({ ...question, index: 1 }, templateId, ctaText || DEFAULT_CTA, origin);

    const paths = await uploadQuestionSlides(row.id, rendered.map((s) => ({ filename: s.filename, buffer: s.buffer })));

    await setSlideState(row.id, {
      slide_status: "ready",
      slide_paths: paths,
      slide_error: null,
      slide_rendered_at: new Date().toISOString(),
    });

    return { paths, count: paths.length };
  } catch (err) {
    const message = errorMessage(err, "Slide render failed");
    // Best-effort: if the DB write itself fails there is nothing more we can do,
    // and losing the reason is better than masking the original failure.
    await setSlideState(row.id, { slide_status: "failed", slide_error: message }).catch(() => {});
    throw new Error(message);
  }
}

/** Deletes a question's stored slides. Used when a question is deleted, and
 * when it is edited (the old images no longer match the new content). */
export async function clearQuestionSlides(questionId: string): Promise<void> {
  await removeQuestionSlidesByPrefix(questionId);
  await setSlideState(questionId, {
    slide_status: "none",
    slide_paths: null,
    slide_error: null,
    slide_rendered_at: null,
  });
}
