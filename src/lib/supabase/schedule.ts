import { getSupabaseAdmin } from "./server";
import type { TelegramPostSnapshot, TelegramScheduledPostRow } from "@/lib/supabase/schema-types";
import { zonedDateTimeToUtc, utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import { clampPostsPerDay, DEFAULT_POST_TIME, slotStaggerMs } from "@/lib/telegram/postTimes";

export interface ScheduleConflict {
  conflict: true;
  existing: TelegramScheduledPostRow;
}

export interface ScheduleCreated {
  conflict: false;
  post: TelegramScheduledPostRow;
}

/** A post in any of these states occupies a slot. `failed` deliberately does
 * NOT hold a slot: a post that failed to send is retryable, and if the admin
 * never retries it, the slot should return to the pool rather than stay blocked
 * forever. `cancelled` is likewise free. */
export const HOLDS_SLOT = ["scheduled", "publishing", "published"] as const;

export interface SchedulingSettings {
  /** The one time-of-day every post goes out, e.g. "19:00". */
  dailyTime: string;
  /** How many posts a single calendar day may hold. */
  postsPerDay: number;
  timezone: string;
  enabled: boolean;
}

/** Reads the live publishing settings, falling back to sane defaults so a
 * missing or malformed row can never stop scheduling from working. */
export async function getSchedulingSettings(): Promise<SchedulingSettings> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("telegram_settings").select("post_times, daily_time, timezone, posts_per_day, enabled").eq("id", true).maybeSingle();
  const times = Array.isArray(data?.post_times) ? (data.post_times as string[]).filter((t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t)) : [];
  const fallback = typeof data?.daily_time === "string" && /^\d{2}:\d{2}$/.test(data.daily_time) ? data.daily_time : DEFAULT_POST_TIME;
  return {
    dailyTime: times[0] ?? fallback,
    postsPerDay: clampPostsPerDay(data?.posts_per_day),
    timezone: data?.timezone ?? "UTC",
    enabled: data?.enabled ?? true,
  };
}

/** Every post on a given channel + calendar day that still holds its slot, in
 * the user's own timezone, earliest first. A day holds up to `postsPerDay` of
 * these. */
export async function listDayPosts(channel: string, dateStr: string, timezone: string): Promise<TelegramScheduledPostRow[]> {
  const db = getSupabaseAdmin();
  const dayStartUtc = zonedDateTimeToUtc(dateStr, "00:00", timezone);
  const dayEndUtc = zonedDateTimeToUtc(dateStr, "23:59", timezone);
  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .select("*")
    .eq("telegram_channel", channel)
    .in("status", [...HOLDS_SLOT])
    .gte("scheduled_at", dayStartUtc.toISOString())
    .lte("scheduled_at", dayEndUtc.toISOString())
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data as unknown as TelegramScheduledPostRow[];
}

/** Compares two "HH:MM" strings without needing a Date. */
function sameTime(a: string, b: string): boolean {
  return a.slice(0, 5) === b.slice(0, 5);
}

/** How many more posts a day can take. Zero means it is full.
 *
 *  Capacity is per DAY, not per wall-clock slot. Every post of a day goes out at
 *  the same time, so matching on time-of-day would make the second post of the
 *  day look like a clash with the first and the day could never fill. */
export async function remainingCapacityOn(
  channel: string,
  postsPerDay: number,
  dateStr: string,
  timezone: string,
  excludePostId?: string,
): Promise<number> {
  const taken = await listDayPosts(channel, dateStr, timezone);
  const live = excludePostId ? taken.filter((p) => p.id !== excludePostId) : taken;
  return Math.max(0, postsPerDay - live.length);
}

/** The post already occupying a day's last free place, if any. Returned so the
 *  caller can show the admin *which* post is in the way rather than a bare
 *  "conflict". */
export async function findDayCapacityConflict(
  channel: string,
  postsPerDay: number,
  dateStr: string,
  timezone: string,
  excludePostId?: string,
): Promise<TelegramScheduledPostRow | null> {
  const taken = await listDayPosts(channel, dateStr, timezone);
  const live = excludePostId ? taken.filter((p) => p.id !== excludePostId) : taken;
  if (live.length < postsPerDay) return null;
  return live[0] ?? null;
}

/** True when the two posts sit at the same wall-clock time, which is now the
 *  normal case rather than a conflict: it's what "both posts at one time" means.
 *  Kept as an explicit predicate so the distinction is visible at every call
 *  site instead of being inferred from context. */
export function sharesTimeWith(a: TelegramScheduledPostRow, b: TelegramScheduledPostRow, timezone: string): boolean {
  return sameTime(utcToZonedTimeStr(new Date(a.scheduled_at), timezone), utcToZonedTimeStr(new Date(b.scheduled_at), timezone));
}

export interface Slot {
  dateStr: string;
  timeStr: string;
  /** Position within the day, 0-based. Also the sub-minute stagger that keeps
   *  two same-time posts orderable by `scheduled_at`. */
  slotIndex: number;
}

/** Walks forward one day at a time from `afterDate` until it finds a day with
 * capacity left, returning it. `horizonDays` bounds the walk so a fully-booked
 * year can't spin forever. Returns null when nothing is free in range, which
 *  callers surface as "calendar is full" rather than an error. */
export async function findNextAvailableSlot(
  channel: string,
  postsPerDay: number,
  timezone: string,
  dailyTime: string,
  afterDate: string,
  horizonDays = 365,
): Promise<Slot | null> {
  let cursor = new Date(`${afterDate}T00:00:00Z`);
  for (let day = 0; day < horizonDays; day++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const dateStr = utcToZonedDateStr(cursor, "UTC");
    // eslint-disable-next-line no-await-in-loop
    const taken = await listDayPosts(channel, dateStr, timezone);
    if (taken.length < postsPerDay) {
      return { dateStr, timeStr: dailyTime, slotIndex: taken.length };
    }
  }
  return null;
}

export async function createScheduledPost(params: {
  contentId: string;
  snapshot: TelegramPostSnapshot;
  channel: string;
  dateStr: string;
  timeStr: string;
  timezone: string;
  /** Position within the day. Omit to derive it from what is already there. */
  slotIndex?: number;
  replaceConflict?: boolean;
}): Promise<ScheduleConflict | ScheduleCreated> {
  const db = getSupabaseAdmin();
  const { postsPerDay } = await getSchedulingSettings();
  const taken = await listDayPosts(params.channel, params.dateStr, params.timezone);
  const existing = taken.length >= postsPerDay ? (taken[0] ?? null) : null;
  if (existing && !params.replaceConflict) {
    return { conflict: true, existing };
  }
  if (existing && params.replaceConflict) {
    const { error: cancelErr } = await db.from("telegram_scheduled_posts").update({ status: "cancelled" }).eq("id", existing.id);
    if (cancelErr) throw cancelErr;
  }

  const slotIndex = params.slotIndex ?? taken.length;
  const scheduledAtUtc = new Date(zonedDateTimeToUtc(params.dateStr, params.timeStr, params.timezone).getTime() + slotStaggerMs(slotIndex));

  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .insert({
      content_id: params.contentId,
      content_snapshot: params.snapshot,
      telegram_channel: params.channel,
      scheduled_at: scheduledAtUtc.toISOString(),
      timezone: params.timezone,
      status: "scheduled",
      slot_index: slotIndex,
    })
    .select()
    .single();
  if (error) throw error;
  return { conflict: false, post: data as unknown as TelegramScheduledPostRow };
}

export async function listScheduledPosts(fromUtc: Date, toUtc: Date) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .select("*, nclex_questions(question, category, type)")
    .gte("scheduled_at", fromUtc.toISOString())
    .lte("scheduled_at", toUtc.toISOString())
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Moves a post to another day, or to a different position within its day.
 *  Checks the target day's capacity, which it previously did not — a move could
 *  silently overfill a day and only the publisher's slot claim would later
 *  reveal it. */
export async function updateScheduledPost(
  id: string,
  params: { dateStr: string; timeStr?: string; timezone: string },
): Promise<ScheduleConflict | { conflict: false; post: TelegramScheduledPostRow }> {
  const db = getSupabaseAdmin();

  const { data: current, error: readErr } = await db.from("telegram_scheduled_posts").select("*").eq("id", id).maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new Error("Scheduled post not found");
  const row = current as unknown as TelegramScheduledPostRow;

  const { dailyTime, postsPerDay } = await getSchedulingSettings();
  const clash = await findDayCapacityConflict(row.telegram_channel, postsPerDay, params.dateStr, params.timezone, id);
  if (clash) return { conflict: true, existing: clash };

  // Keep the post's position within its day when it isn't being reordered, so a
  // plain "move this to Friday" doesn't silently reshuffle slot order.
  const dayPosts = await listDayPosts(row.telegram_channel, params.dateStr, params.timezone);
  const priorPosition = dayPosts.findIndex((p) => p.id === id);
  const slotIndex = priorPosition >= 0 ? priorPosition : Math.max(0, dayPosts.length);

  const timeStr = params.timeStr ?? dailyTime;
  const scheduledAtUtc = new Date(zonedDateTimeToUtc(params.dateStr, timeStr, params.timezone).getTime() + slotStaggerMs(slotIndex));

  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .update({
      scheduled_at: scheduledAtUtc.toISOString(),
      timezone: params.timezone,
      slot_index: slotIndex,
      // A post moved into the past, or a failed one being rescheduled, must go
      // back to 'scheduled' so the publisher picks it up again.
      status: "scheduled",
      error_message: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return { conflict: false, post: data as unknown as TelegramScheduledPostRow };
}

export async function cancelScheduledPost(id: string) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("telegram_scheduled_posts").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

export async function retryScheduledPost(id: string) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("telegram_scheduled_posts").update({ status: "scheduled", error_message: null, attempt_count: 0 }).eq("id", id);
  if (error) throw error;
}