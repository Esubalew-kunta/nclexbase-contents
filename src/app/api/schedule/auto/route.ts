import type { NextRequest } from "next/server";
import { autoScheduleUnscheduled, getSchedulingSettings } from "@/lib/supabase/schedule";
import { getConfiguredChannel } from "@/lib/telegram/client";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Fills the calendar with unassigned questions, one per free slot. Also runs
 * automatically after a question import when auto_schedule is on; this route
 * exists so the admin can re-run it on demand ("I added questions by hand, fill
 * the calendar") and see exactly what was placed and what was skipped. */
export async function POST(_request: NextRequest) {
  try {
    const channel = getConfiguredChannel();
    if (!channel) return Response.json({ error: "Telegram channel is not configured" }, { status: 400 });

    const settings = await getSchedulingSettings();
    if (!settings.enabled) {
      return Response.json({ error: "Publishing is disabled in Telegram settings" }, { status: 400 });
    }
    if (settings.postTimes.length === 0) {
      return Response.json({ error: "No posting times are configured" }, { status: 400 });
    }

    const result = await autoScheduleUnscheduled({ channel });
    return Response.json({ ...result, postTimes: settings.postTimes, timezone: settings.timezone });
  } catch (err) {
    console.error("POST /api/schedule/auto failed:", err);
    return Response.json({ error: errorMessage(err, "Auto-scheduling failed") }, { status: 500 });
  }
}
