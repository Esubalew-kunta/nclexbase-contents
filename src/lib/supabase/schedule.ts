import { getSupabaseAdmin } from "./server";
import type { NclexQuestionRow, TelegramPostSnapshot, TelegramScheduledPostRow } from "@/lib/supabase/schema-types";
import { zonedDateTimeToUtc, utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { buildTelegramSnapshot } from "@/lib/telegram/snapshot";
import { rowToNormalizedQuestion } from "@/lib/supabase/questions";
import { DEFAULT_POST_TIMES, sortPostTimes } from "@/lib/telegram/postTimes";

export interface ScheduleConflict {
  conflict: true;
  existing: TelegramScheduledPostRow;
}

export interface ScheduleCreated {
  conflict: false;
  post: TelegramScheduledPostRow;
}

/** A post in any of these states occupies its slot. `failed` deliberately does
 * NOT hold a slot: a post that failed to send is retryable, and if the admin
 * never retries it, the slot should return to the pool rather than stay blocked
 * forever. `cancelled` is likewise free. */
const HOLDS_SLOT = ["scheduled", "publishing", "published"] as const;

export interface SchedulingSettings {
  postTimes: string[];
  timezone: string;
  autoSchedule: boolean;
  enabled: boolean;
}

/** Reads the live publishing settings, falling back to sane defaults so a
 * missing or malformed row can never stop scheduling from working. */
export async function getSchedulingSettings(): Promise<SchedulingSettings> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("telegram_settings").select("post_times, timezone, auto_schedule, enabled").eq("id", true).maybeSingle();
  const raw = data?.post_times;
  const postTimes = Array.isArray(raw) && raw.length > 0 ? sortPostTimes(raw as string[]) : DEFAULT_POST_TIMES;
  return {
    postTimes,
    timezone: data?.timezone ?? "UTC",
    autoSchedule: data?.auto_schedule ?? true,
    enabled: data?.enabled ?? true,
  };
}

/** Every post on a given channel + calendar day that still holds its slot, in
 * the user's own timezone. A day can now hold more than one post, so callers get
 * the whole picture rather than just the first row. */
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

/** Compares two "HH:MM" strings without needing a Date, so slot matching is
 * exact wall-clock matching in the configured timezone. */
function sameTime(a: string, b: string): boolean {
  return a.slice(0, 5) === b.slice(0, 5);
}

/** The post already occupying a specific wall-clock slot, if any. Conflict
 * detection is per SLOT, not per day — that is what makes two posts a day work
 * instead of the old behaviour where the first post of the day blocked the rest. */
export async function findSlotConflict(
  channel: string,
  dateStr: string,
  timeStr: string,
  timezone: string,
  excludePostId?: string,
): Promise<TelegramScheduledPostRow | null> {
  const dayPosts = await listDayPosts(channel, dateStr, timezone);
  const match = dayPosts.find((p) => sameTime(utcToZonedTimeStr(new Date(p.scheduled_at), timezone), timeStr) && p.id !== excludePostId);
  return match ?? null;
}

/** Which of the configured slot times are still free on a given day. Drives the
 * calendar's "2 of 2 posted" indicator and the slot picker. */
export async function freeSlotsOn(channel: string, postTimes: string[], dateStr: string, timezone: string): Promise<string[]> {
  const taken = await listDayPosts(channel, dateStr, timezone);
  const takenTimes = taken.map((p) => utcToZonedTimeStr(new Date(p.scheduled_at), timezone));
  return sortPostTimes(postTimes).filter((t) => !takenTimes.some((tt) => sameTime(tt, t)));
}

export interface Slot {
  dateStr: string;
  timeStr: string;
  slotIndex: number;
}

/** Walks forward one day at a time from `afterDate` until it finds a configured
 * slot that nobody has taken, returning it. `horizonDays` bounds the walk so a
 * fully-booked year can't spin forever. Returns null when nothing is free in
 * range, which callers surface as "calendar is full" rather than an error. */
export async function findNextAvailableSlot(
  channel: string,
  postTimes: string[],
  timezone: string,
  afterDate: string,
  horizonDays = 365,
): Promise<Slot | null> {
  const sorted = sortPostTimes(postTimes);
  if (sorted.length === 0) return null;

  let cursor = new Date(`${afterDate}T00:00:00Z`);
  for (let day = 0; day < horizonDays; day++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const dateStr = utcToZonedDateStr(cursor, "UTC");
    const free = await freeSlotsOn(channel, sorted, dateStr, timezone);
    if (free.length > 0) {
      const timeStr = free[0];
      return { dateStr, timeStr, slotIndex: sorted.indexOf(timeStr) };
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
  replaceConflict?: boolean;
}): Promise<ScheduleConflict | ScheduleCreated> {
  const db = getSupabaseAdmin();
  const existing = await findSlotConflict(params.channel, params.dateStr, params.timeStr, params.timezone);
  if (existing && !params.replaceConflict) {
    return { conflict: true, existing };
  }
  if (existing && params.replaceConflict) {
    const { error: cancelErr } = await db.from("telegram_scheduled_posts").update({ status: "cancelled" }).eq("id", existing.id);
    if (cancelErr) throw cancelErr;
  }

  const { postTimes } = await getSchedulingSettings();
  const scheduledAtUtc = zonedDateTimeToUtc(params.dateStr, params.timeStr, params.timezone);
  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .insert({
      content_id: params.contentId,
      content_snapshot: params.snapshot,
      telegram_channel: params.channel,
      scheduled_at: scheduledAtUtc.toISOString(),
      timezone: params.timezone,
      status: "scheduled",
      slot_index: sortPostTimes(postTimes).indexOf(params.timeStr) >= 0 ? sortPostTimes(postTimes).indexOf(params.timeStr) : null,
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

/** Moves a post to a new slot. Now checks the target slot for a clash, which it
 * previously did not — rescheduling could silently double-book two posts at the
 * same time, and only the publisher's slot claim would later reveal it. */
export async function updateScheduledPost(
  id: string,
  params: { dateStr: string; timeStr: string; timezone: string },
): Promise<ScheduleConflict | { conflict: false; post: TelegramScheduledPostRow }> {
  const db = getSupabaseAdmin();

  const { data: current, error: readErr } = await db.from("telegram_scheduled_posts").select("*").eq("id", id).maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new Error("Scheduled post not found");
  const row = current as unknown as TelegramScheduledPostRow;

  const clash = await findSlotConflict(row.telegram_channel, params.dateStr, params.timeStr, params.timezone, id);
  if (clash) return { conflict: true, existing: clash };

  const { postTimes } = await getSchedulingSettings();
  const sorted = sortPostTimes(postTimes);
  const slotIndex = sorted.indexOf(params.timeStr);

  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .update({
      scheduled_at: zonedDateTimeToUtc(params.dateStr, params.timeStr, params.timezone).toISOString(),
      timezone: params.timezone,
      slot_index: slotIndex >= 0 ? slotIndex : null,
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
  const { error } = await db
    .from("telegram_scheduled_posts")
    .update({ status: "scheduled", error_message: null, attempt_count: 0 })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- auto-assign

export interface AutoScheduleResult {
  /** Questions placed onto the calendar by this run. */
  scheduled: { questionId: string; dateStr: string; timeStr: string; question: string }[];
  /** Questions that can never be scheduled, with the reason. */
  skipped: { questionId: string; question: string; reason: string }[];
  /** True when the calendar had no free slot left in the horizon. */
  calendarFull: boolean;
}

/** Questions with no live schedule, newest first, in the order they should be
 * posted. */
async function listUnscheduledRows(): Promise<NclexQuestionRow[]> {
  const db = getSupabaseAdmin();
  const { data: active, error: activeErr } = await db.from("telegram_scheduled_posts").select("content_id").in("status", [...HOLDS_SLOT]);
  if (activeErr) throw activeErr;
  const takenIds = new Set(((active ?? []) as { content_id: string }[]).map((r) => r.content_id));

  const { data, error } = await db.from("nclex_questions").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as NclexQuestionRow[]).filter((q) => !takenIds.has(q.id));
}

/** Fills the calendar with unassigned questions, one per free slot, walking
 * forward from today. This is what makes a newly imported question show up on
 * the calendar without the admin touching anything.
 *
 * Incompatible questions (bowtie, ordered-response, calculation) are skipped
 * with their reason rather than scheduled, because posting a question we know we
 * graded wrongly is worse than not posting it. */
export async function autoScheduleUnscheduled(params: { channel: string; limit?: number; horizonDays?: number }): Promise<AutoScheduleResult> {
  const { postTimes, timezone } = await getSchedulingSettings();
  const horizonDays = params.horizonDays ?? 365;
  const limit = params.limit ?? 500;

  const candidates = await listUnscheduledRows();
  const result: AutoScheduleResult = { scheduled: [], skipped: [], calendarFull: false };
  if (candidates.length === 0 || postTimes.length === 0) return result;

  // A single "today" in the configured timezone, advanced as slots fill up.
  let cursorDate = utcToZonedDateStr(new Date(), timezone);

  for (const row of candidates) {
    if (result.scheduled.length >= limit) break;

    const question = rowToNormalizedQuestion(row);
    const compat = checkTelegramCompatibility(question);
    if (!compat.compatible) {
      result.skipped.push({ questionId: row.id, question: row.question, reason: compat.reason ?? "Not Telegram-compatible" });
      continue;
    }

    let snapshot: TelegramPostSnapshot;
    try {
      snapshot = buildTelegramSnapshot(question);
    } catch (err) {
      result.skipped.push({ questionId: row.id, question: row.question, reason: err instanceof Error ? err.message : "Could not build post" });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const slot = await findNextAvailableSlot(params.channel, postTimes, timezone, cursorDate, horizonDays);
    if (!slot) {
      result.calendarFull = true;
      // Remaining candidates will not fit either; note them and stop walking.
      for (const rest of candidates.slice(candidates.indexOf(row) + 1)) {
        result.skipped.push({ questionId: rest.id, question: rest.question, reason: "No free posting slot available" });
      }
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    const created = await createScheduledPost({
      contentId: row.id,
      snapshot,
      channel: params.channel,
      dateStr: slot.dateStr,
      timeStr: slot.timeStr,
      timezone,
    });

    if (created.conflict) {
      // A concurrent auto-assign won the race for this slot. Re-point the
      // cursor at the same day so the next question looks for the day's other
      // slot rather than skipping a whole day.
      cursorDate = slot.dateStr;
      continue;
    }

    result.scheduled.push({ questionId: row.id, dateStr: slot.dateStr, timeStr: slot.timeStr, question: row.question });
    cursorDate = slot.dateStr;
  }

  return result;
}
