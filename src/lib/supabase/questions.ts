import type { NormalizedQuestion } from "@/lib/content/types";
import { getSupabaseAdmin } from "./server";
import type { NclexQuestionRow } from "./schema-types";

/** The only question types the Telegram calendar is allowed to place. Priority
 *  and SATA are the two that post as a poll and the two the automatic fill
 *  handles; every other type (including bowtie, which Telegram cannot grade)
 *  stays in the bank and is placed by hand if at all. */
export const SCHEDULABLE_TYPES = ["priority", "sata"] as const;

function toRow(q: NormalizedQuestion) {
  return {
    external_id: q.id ?? null,
    type: q.type,
    category: q.category,
    instructions: q.instructions,
    question: q.question,
    options: q.options,
    correct_answers: q.correctAnswers,
    correct_answer_text: q.correctAnswerText,
    explanation: q.explanation,
    option_rationales: q.optionRationales,
    key_point: q.keyPoint,
    notes: q.notes,
    format: q.format,
    bowtie: q.bowtie,
  };
}

/** Saves an imported question into the canonical content table. Re-importing
 * the same JSON (matched by its "id" field) updates the existing row instead
 * of creating a duplicate; a question with no "id" always inserts new. */
export async function upsertQuestion(q: NormalizedQuestion): Promise<NclexQuestionRow> {
  const db = getSupabaseAdmin();
  const row = toRow(q);

  if (q.id) {
    const { data, error } = await db.from("nclex_questions").upsert(row, { onConflict: "external_id" }).select().single();
    if (error) throw error;
    return data as unknown as NclexQuestionRow;
  }

  const { data, error } = await db.from("nclex_questions").insert(row).select().single();
  if (error) throw error;
  return data as unknown as NclexQuestionRow;
}

export async function listQuestions(): Promise<NclexQuestionRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("nclex_questions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as NclexQuestionRow[];
}

/** Questions with no schedule in flight (scheduled/publishing/published) —
 * the pool the calendar offers when the user picks an open date. */
export async function listUnscheduledQuestions(): Promise<NclexQuestionRow[]> {
  const db = getSupabaseAdmin();
  const { data: active, error: activeErr } = await db.from("telegram_scheduled_posts").select("content_id").in("status", ["scheduled", "publishing", "published"]);
  if (activeErr) throw activeErr;
  const activeIds = (active ?? []).map((r) => r.content_id);

  let query = db.from("nclex_questions").select("*").order("created_at", { ascending: false });
  if (activeIds.length > 0) {
    query = query.not("id", "in", `(${activeIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as NclexQuestionRow[];
}

/** Every question the calendar is allowed to offer, whether or not it already
 *  holds a slot.
 *
 *  Restricted to Priority and SATA deliberately. Those are the two shapes the
 *  automatic fill places and the two the admin asked to pick from by hand;
 *  everything else stays visible on the bank page but out of the picker. Bowtie
 *  in particular cannot go to Telegram at all — it is graded in three
 *  independent groups — so offering it would only produce a dead end. */
export async function listPostableForCalendar(): Promise<NclexQuestionRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("nclex_questions")
    .select("*")
    .in("type", [...SCHEDULABLE_TYPES])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as unknown as NclexQuestionRow[];
}

/** The three renderable shapes the bank filters by. These are the derived
 * `format` values, not the raw `type` keys, so all 22 raw types collapse into
 * the three groups that actually change how a question is drawn. */
export const BANK_FORMATS = ["single", "multiple", "bowtie"] as const;
export type BankFormat = (typeof BANK_FORMATS)[number];

export const BANK_FORMAT_LABELS: Record<BankFormat, string> = {
  single: "Single answer",
  multiple: "SATA",
  bowtie: "Bowtie",
};

export interface QuestionListFilters {
  format?: BankFormat;
  search?: string;
  /** Only questions with no stored slides yet (or a failed render), so the
   * admin can find what still needs generating. */
  needsSlides?: boolean;
  limit?: number;
}

export async function listQuestionsFiltered(filters: QuestionListFilters = {}): Promise<NclexQuestionRow[]> {
  const db = getSupabaseAdmin();
  let query = db.from("nclex_questions").select("*").order("created_at", { ascending: false });

  if (filters.format) {
    query = query.eq("format", filters.format);
  }
  if (filters.needsSlides) {
    query = query.in("slide_status", ["none", "failed"]);
  }
  if (filters.search) {
    // Strip LIKE wildcards outright rather than escaping them. Escaping relies
    // on backslash semantics that aren't dependable through PostgREST's filter
    // parsing, and an admin typing "100%" wants to search for "100", not match
    // every row in the bank. `search_text` is a generated column holding the
    // prompt, type, category, key point and every option's text, so a word that
    // only appears inside an option still matches.
    const term = filters.search.replace(/[%_\\]/g, "").trim();
    if (term) query = query.ilike("search_text", `%${term}%`);
  }
  query = query.limit(filters.limit ?? 200);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as NclexQuestionRow[];
}

export async function getQuestionById(id: string): Promise<NclexQuestionRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("nclex_questions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as NclexQuestionRow) ?? null;
}

/** Overwrites a question's content from an already-validated NormalizedQuestion.
 *
 * The stored images are NOT touched here — the caller decides, because a text
 * edit that doesn't change the layout doesn't need a re-render. The question's
 * `updated_at` always moves, which is what the bank orders by. */
export async function updateQuestion(id: string, q: NormalizedQuestion): Promise<NclexQuestionRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("nclex_questions")
    .update({ ...toRow(q), external_id: q.id ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as NclexQuestionRow;
}

/** Deletes a question together with any scheduled posts that referenced it.
 *
 * `telegram_scheduled_posts.content_id` is `on delete restrict`, so the posts
 * must go first or the delete fails with a foreign-key error the admin can't
 * act on. They are removed rather than merely cancelled because a post for a
 * question that no longer exists can never be published meaningfully, and
 * leaving the rows behind would permanently block re-deleting the question.
 * Already-cancelled posts are removed too, so a question can always be deleted. */
export async function deleteQuestion(id: string): Promise<{ removedPosts: number }> {
  const db = getSupabaseAdmin();
  const { error: postErr } = await db.from("telegram_scheduled_posts").delete().eq("content_id", id);
  if (postErr) throw postErr;

  const { error } = await db.from("nclex_questions").delete().eq("id", id);
  if (error) throw error;
  return { removedPosts: 1 };
}

export function rowToNormalizedQuestion(row: NclexQuestionRow): NormalizedQuestion {  return {
    id: row.external_id ?? row.id,
    index: 0,
    type: row.type,
    category: row.category,
    instructions: row.instructions,
    question: row.question,
    options: row.options,
    correctAnswers: row.correct_answers,
    correctAnswerText: row.correct_answer_text,
    explanation: row.explanation,
    optionRationales: row.option_rationales,
    keyPoint: row.key_point,
    notes: row.notes,
    format: row.format as NormalizedQuestion["format"],
    bowtie: row.bowtie ?? null,
  };
}
