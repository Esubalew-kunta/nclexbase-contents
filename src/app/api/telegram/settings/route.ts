import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getConfiguredChannel } from "@/lib/telegram/client";
import { postTimesSchema, postTimeSchema, sortPostTimes } from "@/lib/telegram/postTimes";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

/** A time stored from an older, looser client (or hand-edited in the DB) must
 * not be allowed to poison slot matching later, so the same HH:MM rule is
 * enforced on read as on write. */
function sanitisePostTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string" && postTimeSchema.safeParse(t).success);
}

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("telegram_settings").select("*").eq("id", true).single();
    if (error) throw error;
    const postTimes = sanitisePostTimes(data.post_times);
    return Response.json({
      settings: {
        ...data,
        post_times: postTimes.length > 0 ? sortPostTimes(postTimes) : undefined,
        channel: data.channel ?? getConfiguredChannel(),
      },
    });
  } catch (err) {
    console.error("GET /api/telegram/settings failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to load settings") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      daily_time?: string;
      timezone?: string;
      post_followup?: boolean;
      auto_schedule?: boolean;
      post_times?: unknown;
    };
    const db = getSupabaseAdmin();

    const patch: Record<string, unknown> = {};
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.post_followup !== undefined) patch.post_followup = Boolean(body.post_followup);
    if (body.auto_schedule !== undefined) patch.auto_schedule = Boolean(body.auto_schedule);
    if (typeof body.daily_time === "string" && postTimeSchema.safeParse(body.daily_time).success) patch.daily_time = body.daily_time;
    if (typeof body.timezone === "string" && body.timezone.trim()) patch.timezone = body.timezone.trim();

    if (body.post_times !== undefined) {
      // Validated rather than passed through: post_times length IS the number of
      // posts per day, so an empty or malformed value would quietly stop all
      // scheduling rather than fail visibly.
      const parsed = postTimesSchema.safeParse(body.post_times);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid posting times" }, { status: 400 });
      }
      patch.post_times = sortPostTimes(parsed.data);
    }

    const { data, error } = await db.from("telegram_settings").update(patch).eq("id", true).select().single();
    if (error) throw error;
    return Response.json({ settings: { ...data, channel: data.channel ?? getConfiguredChannel() } });
  } catch (err) {
    console.error("PATCH /api/telegram/settings failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to save settings") }, { status: 500 });
  }
}
