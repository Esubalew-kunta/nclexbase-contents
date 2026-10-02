import type { NextRequest } from "next/server";
import { findNextAvailableSlot, getSchedulingSettings } from "@/lib/supabase/schedule";
import { getConfiguredChannel } from "@/lib/telegram/client";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

/** The next free posting slot — a day AND a time, since a day can hold several
 * posts. Returns `slot: null` when the calendar is full in the horizon rather
 * than a 500, so the caller can say "nothing free" instead of "broken". */
export async function GET(request: NextRequest) {
  try {
    const channel = getConfiguredChannel();
    if (!channel) return Response.json({ error: "Telegram channel is not configured" }, { status: 400 });

    const settings = await getSchedulingSettings();
    const params = request.nextUrl.searchParams;
    const timezone = params.get("timezone") ?? settings.timezone;
    const after = params.get("after") ?? new Date().toISOString().slice(0, 10);
    const horizon = Number(params.get("horizonDays") ?? 365);

    const slot = await findNextAvailableSlot(channel, settings.postTimes, timezone, after, Number.isFinite(horizon) ? horizon : 365);
    return Response.json({ slot, postTimes: settings.postTimes, timezone });
  } catch (err) {
    console.error("GET /api/schedule/next-available failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to find the next available slot") }, { status: 500 });
  }
}
