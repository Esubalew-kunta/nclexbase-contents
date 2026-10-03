import { getSupabaseAdmin } from "./server";
import { rowToNormalizedQuestion } from "./questions";
import { buildTelegramSnapshot } from "@/lib/telegram/snapshot";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import type { NclexQuestionRow, TelegramPostSnapshot, TelegramScheduledPostRow } from "@/lib/supabase/schema-types";

/** Swaps the question occupying a scheduled slot for a different one, keeping
 * the date, time and timezone the admin already chose.
 *
 * Three cases, because "the admin picked a different question" means different
 * things depending on where that question was:
 *  - it is scheduled on ANOTHER day → the two questions trade days. This is what
 *    the calendar's tick-box list does, and it is why neither question ends up
 *    duplicated or dropped.
 *  - it is in the bank with no day → it simply takes this slot, and whatever was
 *    here goes back to the bank (nothing references it as a live post any more,
 *    so it becomes a candidate again without a second write).
 *  - it is the question already in this slot → a no-op, not an error.
 *
 * The two-day swap is written by the `swap_slot_content` SQL function so both
 * rows land in one transaction. Doing it as two independent updates from here
 * means a failure between them leaves the calendar with one day's question on
 * the wrong day — which is far worse than either outcome being fully applied.
 *
 * The snapshot is rebuilt from the replacement question — posts stay
 * self-contained and frozen, so this is safe even for an already-published post
 * (it changes what a future retry would send; it does not edit Telegram). */
export async function replaceQuestionInSlot(
  postId: string,
  newContentId: string,
): Promise<{ post?: TelegramScheduledPostRow; error?: string; swappedWith?: string }> {
  const db = getSupabaseAdmin();

  const { data: post, error: postErr } = await db.from("telegram_scheduled_posts").select("*").eq("id", postId).maybeSingle();
  if (postErr) throw postErr;
  if (!post) return { error: "Scheduled post not found" };

  const { data: question, error: qErr } = await db.from("nclex_questions").select("*").eq("id", newContentId).maybeSingle();
  if (qErr) throw qErr;
  if (!question) return { error: "Replacement question not found" };

  if (post.content_id === newContentId) {
    return { post: post as unknown as TelegramScheduledPostRow };
  }

  const normalized = rowToNormalizedQuestion(question as unknown as NclexQuestionRow);
  const compat = checkTelegramCompatibility(normalized);
  if (!compat.compatible) {
    return { error: compat.reason ?? "That question cannot be posted to Telegram" };
  }

  let snapshot;
  try {
    snapshot = buildTelegramSnapshot(normalized);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not build the post" };
  }

  // Is the incoming question already holding a live slot somewhere else? If so
  // this is a swap, and both snapshots have to be written together.
  const { data: live, error: liveErr } = await db
    .from("telegram_scheduled_posts")
    .select("*")
    .eq("content_id", newContentId)
    .in("status", ["scheduled", "publishing", "published"]);
  if (liveErr) throw liveErr;

  const other = ((live ?? []) as unknown as TelegramScheduledPostRow[]).find((p) => p.id !== postId);

  if (other) {
    // The displaced question needs its own snapshot too: this post is about to
    // stop referencing it, and the other post is about to start.
    const { data: displacedRow, error: dErr } = await db.from("nclex_questions").select("*").eq("id", post.content_id).maybeSingle();
    if (dErr) throw dErr;

    let displacedSnapshot = null;
    if (displacedRow) {
      try {
        displacedSnapshot = buildTelegramSnapshot(rowToNormalizedQuestion(displacedRow as unknown as NclexQuestionRow));
      } catch {
        // A question that has become Telegram-incompatible (edited after it was
        // scheduled) can't have a fresh snapshot built. It keeps the snapshot
        // the other post already holds, which is what was going to be sent
        // anyway, rather than failing the whole swap.
        displacedSnapshot = other.content_snapshot;
      }
    }

    const { error: swapErr } = await db.rpc("swap_slot_content", {
      p_post_a: postId,
      p_post_b: other.id,
      p_content_a: newContentId,
      p_snapshot_a: snapshot,
      p_content_b: post.content_id,
      p_snapshot_b: displacedSnapshot ?? other.content_snapshot,
    });
    if (swapErr) throw swapErr;

    const { data: updated, error: readBack } = await db.from("telegram_scheduled_posts").select("*").eq("id", postId).maybeSingle();
    if (readBack) throw readBack;
    return { post: updated as unknown as TelegramScheduledPostRow, swappedWith: other.id };
  }

  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .update({ content_id: newContentId, content_snapshot: snapshot })
    .eq("id", postId)
    .select()
    .single();
  if (error) throw error;

  return { post: data as unknown as TelegramScheduledPostRow };
}

export interface AssignmentRow {
  postId: string;
  status: string;
  dateStr: string;
  timeStr: string;
  timezone: string;
  questionId: string;
  question: string;
  category: string | null;
  type: string;
  format: string;
  canPostToTelegram: boolean;
  reason: string | null;
}

/** The admin's "show me what is scheduled and when" board: every post in a
 * window, joined to its question, with each question's Telegram eligibility
 * spelled out so it is obvious at a glance why something could not be posted. */
export async function listAssignments(fromUtc: Date, toUtc: Date): Promise<AssignmentRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("telegram_scheduled_posts")
    .select("id, status, scheduled_at, timezone, content_id, content_snapshot, nclex_questions(id, question, category, type, format, options, correct_answers, correct_answer_text, explanation, option_rationales, key_point, notes, instructions, bowtie, external_id)")
    .gte("scheduled_at", fromUtc.toISOString())
    .lte("scheduled_at", toUtc.toISOString())
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as { id: string; status: string; scheduled_at: string; timezone: string; content_id: string; content_snapshot: TelegramPostSnapshot; nclex_questions: NclexQuestionRow | null }[]).map((r) => {
    const q = r.nclex_questions;
    const compat = q ? checkTelegramCompatibility(rowToNormalizedQuestion(q)) : null;
    return {
      postId: r.id,
      status: r.status,
      dateStr: utcToZonedDateStr(new Date(r.scheduled_at), r.timezone),
      timeStr: utcToZonedTimeStr(new Date(r.scheduled_at), r.timezone),
      timezone: r.timezone,
      questionId: r.content_id,
      question: q?.question ?? "(question deleted)",
      category: q?.category ?? null,
      type: q?.type ?? "",
      format: q?.format ?? "",
      canPostToTelegram: compat?.compatible ?? false,
      reason: compat?.compatible ? null : (compat?.reason ?? "Question is no longer available"),
    };
  });
}

/** Questions eligible to be dropped into a Telegram slot, with the reason any
 * others were excluded. Powers the "replace" picker. */
export function telegramEligibility(rows: NclexQuestionRow[]): { eligible: NclexQuestionRow[]; rejected: { row: NclexQuestionRow; reason: string }[] } {
  const eligible: NclexQuestionRow[] = [];
  const rejected: { row: NclexQuestionRow; reason: string }[] = [];
  for (const row of rows) {
    const compat = checkTelegramCompatibility(rowToNormalizedQuestion(row));
    if (compat.compatible) eligible.push(row);
    else rejected.push({ row, reason: compat.reason ?? "Not Telegram-compatible" });
  }
  return { eligible, rejected };
}
