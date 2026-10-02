import type { NextRequest } from "next/server";
import { listAssignments, telegramEligibility } from "@/lib/supabase/replace";
import { getSchedulingSettings } from "@/lib/supabase/schedule";
import { listQuestionsFiltered } from "@/lib/supabase/questions";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

/** The scheduling board: what's already assigned and when, plus the pool of
 * questions still waiting for a slot. This is the admin's "show me everything
 * and let me change it" view. */
export async function GET(request: NextRequest) {
  try {
    const settings = await getSchedulingSettings();
    const params = request.nextUrl.searchParams;
    const days = Math.min(Number(params.get("days") ?? 60) || 60, 365);

    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const [assignments, pool] = await Promise.all([listAssignments(from, to), listQuestionsFiltered({ limit: 500 })]);

    const { eligible, rejected } = telegramEligibility(pool);
    const assignedIds = new Set(assignments.map((a) => a.questionId));

    return Response.json({
      postTimes: settings.postTimes,
      timezone: settings.timezone,
      autoSchedule: settings.autoSchedule,
      enabled: settings.enabled,
      assignments,
      unassigned: eligible
        .filter((q) => !assignedIds.has(q.id))
        .map((q) => ({ id: q.id, question: q.question, type: q.type, format: q.format, category: q.category })),
      // Every question Telegram can actually represent, whether or not it
      // already holds a slot. The replace picker needs all of them: limiting it
      // to unassigned questions makes replacement a dead end once the bank is
      // fully scheduled, which is exactly when the admin most wants to swap one
      // out. `assignedElsewhere` lets the UI warn before they create a double-book.
      allPostable: eligible.map((q) => ({ id: q.id, question: q.question, type: q.type, format: q.format, category: q.category, assigned: assignedIds.has(q.id) })),
      notPostable: rejected.map(({ row, reason }) => ({ id: row.id, question: row.question, type: row.type, format: row.format, reason })),
    });
  } catch (err) {
    console.error("GET /api/schedule/board failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to load the scheduling board") }, { status: 500 });
  }
}
