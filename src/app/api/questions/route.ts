import type { NextRequest } from "next/server";
import { BANK_FORMATS, listQuestionsFiltered, listUnscheduledQuestions, upsertQuestion, type BankFormat } from "@/lib/supabase/questions";
import { signSlideUrls } from "@/lib/supabase/storage";
import { parseQuestionsJson } from "@/lib/content/normalize";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    // The unscheduled pool is the calendar's picker list, not a bank view, so
    // it keeps its own simple shape and ignores the bank filters.
    if (params.get("unscheduled") === "1") {
      const rows = await listUnscheduledQuestions();
      return Response.json({ questions: rows });
    }

    const rawFormat = params.get("format");
    const format = BANK_FORMATS.includes(rawFormat as BankFormat) ? (rawFormat as BankFormat) : undefined;

    const rows = await listQuestionsFiltered({
      format,
      search: params.get("search")?.trim() || undefined,
      needsSlides: params.get("needsSlides") === "1",
    });

    // Sign every question's slides in one batch rather than per row, so a bank
    // of 200 questions costs one Storage round trip instead of 200.
    const withPaths = rows.filter((r) => r.slide_paths && r.slide_paths.length > 0);
    const flat = withPaths.flatMap((r) => r.slide_paths!);
    const signed = await signSlideUrls(flat);

    let cursor = 0;
    const questions = rows.map((row) => {
      let slideUrls: (string | null)[] = [];
      if (row.slide_paths && row.slide_paths.length > 0) {
        slideUrls = signed.slice(cursor, cursor + row.slide_paths.length);
        cursor += row.slide_paths.length;
      }
      // search_text is a Postgres-generated column used only for filtering; it
      // duplicates content already in the row, so it never leaves the server.
      const { search_text: _unused, ...rest } = row;
      return { ...rest, slideUrls };
    });

    return Response.json({ questions });
  } catch (err) {
    console.error("GET /api/questions failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to list questions") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { questions?: unknown[]; json?: string };

    // Accepts the same raw JSON the generator imports and normalizes it HERE,
    // so the database can only ever be written by the one validator that also
    // backs the live preview. Previously this route trusted the caller to have
    // already normalized, so posting raw import JSON hit a NOT NULL violation
    // on `format` and surfaced as an opaque 500.
    const json = typeof body.json === "string" ? body.json : JSON.stringify(body.questions ?? []);

    const { result, parseError } = parseQuestionsJson(json);
    if (parseError) return Response.json({ error: parseError }, { status: 400 });
    if (!result) return Response.json({ error: "Could not read the submitted questions" }, { status: 400 });

    // Specific problems first: a question with a broken correctAnswer produces
    // both an issue list and an empty questions array, and the issues are what
    // the admin can act on.
    if (result.issues.length > 0) {
      return Response.json({ error: "Some questions have validation problems", issues: result.issues }, { status: 400 });
    }
    if (result.questions.length === 0) {
      return Response.json({ error: "No questions found in the submitted content" }, { status: 400 });
    }

    const saved = [];
    for (const q of result.questions) {
      saved.push(await upsertQuestion(q));
    }

    // Imported questions land in the bank only; the admin places each one onto
    // the Telegram calendar by hand from there.
    return Response.json({ questions: saved });
  } catch (err) {
    console.error("POST /api/questions failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to save questions") }, { status: 500 });
  }
}
