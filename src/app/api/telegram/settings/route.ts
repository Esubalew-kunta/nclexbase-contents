import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getConfiguredChannel } from "@/lib/telegram/client";
import { clampPostsPerDay, DEFAULT_POST_TIME, postsPerDaySchema, postTimeSchema } from "@/lib/telegram/postTimes";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

/** The single time every post of the day goes out, read from the legacy
 *  `post_times` array's first entry. Older rows hold several times; migration
 *  0008 collapsed them to one, but a row that missed the migration still parses
 *  fine here and scheduling carries on. */
function sanitisePostTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string" && postTimeSchema.safeParse(t).success);
}

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("telegram_settings").select("*").eq("id", true).single();
    if (error) throw error;
    const times = sanitisePostTimes(data.post_times);
    return Response.json({
      settings: {
        ...data,
        dailyTime: times[0] ?? DEFAULT_POST_TIME,
        postsPerDay: clampPostsPerDay(data.posts_per_day),
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
      dailyTime?: string;
      postsPerDay?: number;
      timezone?: string;
    };
    const db = getSupabaseAdmin();

    const patch: Record<string, unknown> = {};
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (typeof body.timezone === "string" && body.timezone.trim()) patch.timezone = body.timezone.trim();

    if (body.dailyTime !== undefined) {
      const parsed = postTimeSchema.safeParse(body.dailyTime);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid posting time" }, { status: 400 });
      }
      patch.daily_time = parsed.data;
      // post_times is the array form the rest of the app and older rows still
      // understand; both are written so the two never disagree.
      patch.post_times = [parsed.data];
    }

    if (body.postsPerDay !== undefined) {
      const parsed = postsPerDaySchema.safeParse(body.postsPerDay);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid posts-per-day" }, { status: 400 });
      }
      patch.posts_per_day = parsed.data;
    }

    const { data, error } = await db.from("telegram_settings").update(patch).eq("id", true).select().single();
    if (error) throw error;
    return Response.json({
      settings: {
        ...data,
        dailyTime: sanitisePostTimes(data.post_times)[0] ?? DEFAULT_POST_TIME,
        postsPerDay: clampPostsPerDay(data.posts_per_day),
        channel: data.channel ?? getConfiguredChannel(),
      },
    });
  } catch (err) {
    console.error("PATCH /api/telegram/settings failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to save settings") }, { status: 500 });
  }
}