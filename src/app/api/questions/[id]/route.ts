import type { NextRequest } from "next/server";
import { deleteQuestion, getQuestionById, updateQuestion } from "@/lib/supabase/questions";
import { signSlideUrls } from "@/lib/supabase/storage";
import { parseQuestionsJson } from "@/lib/content/normalize";
import { errorMessage } from "@/lib/errorMessage";
import type { NormalizedQuestion } from "@/lib/content/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = await getQuestionById(id);
    if (!row) return Response.json({ error: "Question not found" }, { status: 404 });
    const slideUrls = row.slide_paths?.length ? await signSlideUrls(row.slide_paths) : [];
    const { search_text: _unused, ...rest } = row;
    return Response.json({ question: { ...rest, slideUrls } });
  } catch (err) {
    console.error("GET /api/questions/[id] failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to load question") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await getQuestionById(id);
    if (!existing) return Response.json({ error: "Question not found" }, { status: 404 });

    const body = (await request.json()) as { question: unknown };

    // Re-run the edited content through the exact same validator the JSON
    // importer uses. An edit that would never survive an import is rejected
    // here too, so the bank can never hold a question the generator can't
    // render.
    const { result, parseError } = parseQuestionsJson(JSON.stringify(body.question));
    if (parseError) return Response.json({ error: parseError }, { status: 400 });
    if (!result) return Response.json({ error: "Could not read the submitted question" }, { status: 400 });

    // Report the specific problems before the generic "nothing to save" case:
    // a question whose correctAnswer matches no option produces both an issue
    // list and an empty questions array, and the issue list is what the admin
    // can actually act on.
    if (result.issues.length > 0) {
      return Response.json({ error: "Question has validation problems", issues: result.issues }, { status: 400 });
    }
    if (result.questions.length === 0) {
      return Response.json({ error: "No question found in the submitted content" }, { status: 400 });
    }

    const updated = await updateQuestion(id, result.questions[0] as NormalizedQuestion);
    return Response.json({ question: updated });
  } catch (err) {
    console.error("PUT /api/questions/[id] failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to update question") }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await getQuestionById(id);
    if (!existing) return Response.json({ error: "Question not found" }, { status: 404 });

    // Best-effort image cleanup. The question row is the source of truth and
    // the FK-cancelling delete is what the admin actually asked for, so a
    // Storage failure is logged rather than allowed to block the delete.
    const { removeQuestionSlidesByPrefix } = await import("@/lib/supabase/storage");
    await removeQuestionSlidesByPrefix(id).catch((e) => console.error("Slide cleanup failed for", id, e));

    await deleteQuestion(id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/questions/[id] failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to delete question") }, { status: 500 });
  }
}
