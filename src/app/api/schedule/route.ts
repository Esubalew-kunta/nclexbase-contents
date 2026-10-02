import type { NextRequest } from "next/server";
import { createScheduledPost, listScheduledPosts } from "@/lib/supabase/schedule";
import { rowToNormalizedQuestion, upsertQuestion } from "@/lib/supabase/questions";
import { buildTelegramSnapshot } from "@/lib/telegram/snapshot";
import { getConfiguredChannel } from "@/lib/telegram/client";
import type { NclexQuestionRow } from "@/lib/supabase/schema-types";
import type { NormalizedQuestion } from "@/lib/content/types";
import { parseQuestionsJson } from "@/lib/content/normalize";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to) return Response.json({ error: "from and to query params (ISO dates) are required" }, { status: 400 });
    const posts = await listScheduledPosts(new Date(from), new Date(to));
    return Response.json({ posts });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to list schedule" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      question: NormalizedQuestion;
      contentId?: string;
      dateStr: string;
      timeStr: string;
      timezone: string;
      replaceConflict?: boolean;
    };

    const channel = getConfiguredChannel();
    if (!channel) return Response.json({ error: "Telegram channel is not configured" }, { status: 400 });

    // Accept either an already-normalized question or the raw import shape, and
    // normalize the latter here. Without this, posting raw JSON reaches
    // upsertQuestion missing `format` and fails as an opaque NOT NULL 500
    // rather than something the caller can act on.
    let question = body.question as NormalizedQuestion;
    if (question.format === undefined) {
      const { result, parseError } = parseQuestionsJson(JSON.stringify(body.question));
      if (parseError) return Response.json({ error: parseError }, { status: 400 });
      if (!result || result.issues.length > 0 || result.questions.length === 0) {
        return Response.json(
          { error: "Question could not be scheduled", issues: result?.issues ?? [] },
          { status: 400 },
        );
      }
      question = result.questions[0];
    }

    let contentId = body.contentId;
    if (!contentId) {
      const saved: NclexQuestionRow = await upsertQuestion(question);
      contentId = saved.id;
      question = rowToNormalizedQuestion(saved);
    }

    const snapshot = buildTelegramSnapshot(question);

    const result = await createScheduledPost({
      contentId,
      snapshot,
      channel,
      dateStr: body.dateStr,
      timeStr: body.timeStr,
      timezone: body.timezone,
      replaceConflict: body.replaceConflict,
    });

    if (result.conflict) {
      return Response.json({ conflict: true, existing: result.existing }, { status: 409 });
    }
    return Response.json({ post: result.post });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to schedule post" }, { status: 500 });
  }
}
