import { getSupabaseAdmin } from "./server";
import { rowToNormalizedQuestion } from "./questions";
import { buildTelegramSnapshot } from "@/lib/telegram/snapshot";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import type { NclexQuestionRow, TelegramScheduledPostRow } from "@/lib/supabase/schema-types";

/** Swaps the question occupying a scheduled slot for a different one, keeping
 * the date, time and timezone the admin already chose.
 *
 * The snapshot is rebuilt from the replacement question — the post stays
 * self-contained and frozen, so this is safe to do for a post that has already
 * been published (it just changes what a future retry would send; it does not
 * edit history in Telegram). */
export async function replaceQuestionInSlot(
  postId: string,
  newContentId: string,
): Promise<{ post?: TelegramScheduledPostRow; error?: string }> {
  const db = getSupabaseAdmin();

  const { data: post, error: postErr } = await db.from("telegram_scheduled_posts").select("*").eq("id", postId).maybeSingle();
  if (postErr) throw postErr;
  if (!post) return { error: "Scheduled post not found" };

  const { data: question, error: qErr } = await db.from("nclex_questions").select("*").eq("id", newContentId).maybeSingle();
  if (qErr) throw qErr;
  if (!question) return { error: "Replacement question not found" };

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

  return ((data ?? []) as unknown as { id: string; status: string; scheduled_at: string; timezone: string; content_id: string; content_snapshot: { question: string; pollOptions: string[]; correctOptionIds: number[]; quizExplanation: string | null; followUpHtml: string | null; followUpText: string | null; isMultiple: boolean }; nclex_questions: NclexQuestionRow | null }[]).map((r) => {
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
