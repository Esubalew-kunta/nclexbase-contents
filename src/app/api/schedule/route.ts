import type { NextRequest } from "next/server";
import { createScheduledPost, getSchedulingSettings, listScheduledPosts } from "@/lib/supabase/schedule";
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
      action?: "place";
      question?: NormalizedQuestion;
      /** The bank question to place, when the caller already knows its id. */
      contentId?: string;
      dateStr?: string;
      timeStr?: string;
      timezone?: string;
      replaceConflict?: boolean;
    };

    const channel = getConfiguredChannel();
    if (!channel) return Response.json({ error: "Telegram channel is not configured" }, { status: 400 });

    // `contentId` is what the calendar's day panel sends: it has already chosen
    // the question and only needs the server to build the payload. Re-reading
    // and re-deriving it here (rather than trusting a snapshot from the browser)
    // keeps the frozen payload on exactly one code path.
    if (body.action === "place") {
      if (!body.contentId || !body.dateStr || !body.timezone) {
        return Response.json({ error: "contentId, dateStr and timezone are required to place a question" }, { status: 400 });
      }
      const { getQuestionById } = await import("@/lib/supabase/questions");
      const row = await getQuestionById(body.contentId);
      if (!row) return Response.json({ error: "Question not found" }, { status: 404 });

      let snapshot;
      try {
        snapshot = buildTelegramSnapshot(rowToNormalizedQuestion(row));
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "That question cannot be posted to Telegram" }, { status: 400 });
      }

      const result = await createScheduledPost({
        contentId: body.contentId,
        snapshot,
        channel,
        dateStr: body.dateStr,
        timeStr: body.timeStr ?? (await getSchedulingSettings()).dailyTime,
        timezone: body.timezone,
        replaceConflict: body.replaceConflict,
      });
      if (result.conflict) {
        return Response.json({ conflict: true, existing: result.existing, error: "That day already has its full set of posts" }, { status: 409 });
      }
      return Response.json({ post: result.post });
    }

    // Accept either an already-normalized question or the raw import shape, and
    // normalize the latter here. Without this, posting raw JSON reaches
    // upsertQuestion missing `format` and fails as an opaque NOT NULL 500
    // rather than something the caller can act on.
    let question = body.question as NormalizedQuestion;
    if (!question) return Response.json({ error: "A question is required" }, { status: 400 });
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

    if (!body.dateStr || !body.timezone) {
      return Response.json({ error: "dateStr and timezone are required to schedule" }, { status: 400 });
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
      timeStr: body.timeStr ?? (await getSchedulingSettings()).dailyTime,
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
