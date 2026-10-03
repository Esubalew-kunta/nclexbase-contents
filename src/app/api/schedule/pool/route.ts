import { listPostableForCalendar } from "@/lib/supabase/questions";
import { rowToNormalizedQuestion } from "@/lib/supabase/questions";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { getSchedulingSettings, HOLDS_SLOT } from "@/lib/supabase/schedule";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { utcToZonedDateStr } from "@/lib/telegram/timezone";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

/** The question bank as the calendar's day picker needs it: Priority and SATA
 *  only, each tagged with its type, and each flagged with whether Telegram can
 *  actually represent it.
 *
 *  A question can be a Priority/SATA type and still be unpostable — an option
 *  over Telegram's 100-character limit, or a stem over 300 — so eligibility is
 *  computed rather than assumed from the type. Those are returned separately
 *  with their reason instead of being hidden, so a question the admin can see in
 *  the bank doesn't silently vanish from the picker with no explanation.
 *
 *  Every postable question carries `assignedDate`: the day it already holds a
 *  live slot on, or null if it's free. The day panel uses this to hide a
 *  question booked on a DIFFERENT day from the picker entirely — ticking it
 *  there would otherwise look like "add this", when what actually happens is a
 *  swap with whatever the panel's own day holds. A question assigned to the
 *  day being viewed keeps `assignedDate` equal to that day, so it still shows
 *  up (ticked) in its own panel. */
export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const [rows, settings, { data: active, error: activeErr }] = await Promise.all([
      listPostableForCalendar(),
      getSchedulingSettings(),
      db.from("telegram_scheduled_posts").select("content_id, scheduled_at, timezone").in("status", [...HOLDS_SLOT]),
    ]);
    if (activeErr) throw activeErr;

    const assignedDateByQuestion = new Map<string, string>();
    for (const row of (active ?? []) as { content_id: string; scheduled_at: string; timezone: string }[]) {
      assignedDateByQuestion.set(row.content_id, utcToZonedDateStr(new Date(row.scheduled_at), row.timezone));
    }

    const postable = [];
    const notPostable: { id: string; question: string; type: string; category: string | null; reason: string }[] = [];

    for (const row of rows) {
      const compat = checkTelegramCompatibility(rowToNormalizedQuestion(row));
      if (!compat.compatible) {
        notPostable.push({ id: row.id, question: row.question, type: row.type, category: row.category, reason: compat.reason ?? "Not Telegram-compatible" });
        continue;
      }
      postable.push({
        id: row.id,
        question: row.question,
        type: row.type,
        category: row.category,
        slideCount: row.slide_paths?.length ?? 0,
        assignedDate: assignedDateByQuestion.get(row.id) ?? null,
      });
    }

    return Response.json({ postable, notPostable, dailyTime: settings.dailyTime, postsPerDay: settings.postsPerDay, timezone: settings.timezone });
  } catch (err) {
    console.error("GET /api/schedule/pool failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to load the question pool") }, { status: 500 });
  }
}