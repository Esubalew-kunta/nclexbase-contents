import type { NormalizedQuestion } from "@/lib/content/types";

/** The Bot API hard-caps the quiz poll's native "explanation" field (the 💡
 * lamp icon) at 200 characters and rejects the *entire* sendPoll call if it's
 * longer. So the text is split: whatever fits goes in the native field, and
 * whatever didn't is carried in full by the follow-up message. Nothing is ever
 * dropped. */
const MAX_LAMP_LEN = 200;

const LAMP_ELLIPSIS = "\u2026";

/** Escapes the three characters Telegram's HTML parse mode treats as markup.
 * Every piece of user-supplied text passes through this before it is wrapped
 * in a <b> tag, so a rationale containing "<" or "&" can never be read as
 * markup (or crash the parse and fail the whole message). */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Truncates on a word boundary where one is reasonably close to the limit,
 * so we never cut mid-word for a tiny gain, and never leave a stub. */
export function truncateAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const hard = trimmed.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${body.replace(/[\s,;:.-]+$/, "")}${LAMP_ELLIPSIS}`;
}

export interface QuizExplanationModel {
  /** Text for the poll's native lamp-icon field, already within the 200-char
   * cap. Null when the question has no explanation at all. */
  lampText: string | null;
  /** The full, untruncated explanation — only set when it was too long for
   * the lamp field and therefore has to travel in the follow-up message. */
  overflowText: string | null;
}

/** Decides how the "why" is delivered. When the whole explanation fits inside
 * Telegram's cap it stays in the native lamp field (nicest UX, and what the
 * viewer sees by tapping 💡). When it doesn't, the lamp gets a truncated
 * teaser and the *complete* text moves to the follow-up message so the reader
 * still gets the full reasoning. */
export function buildQuizExplanation(q: NormalizedQuestion): QuizExplanationModel {
  const explanation = q.explanation?.trim();
  if (!explanation) return { lampText: null, overflowText: null };
  if (explanation.length <= MAX_LAMP_LEN) return { lampText: explanation, overflowText: null };
  return { lampText: truncateAtWord(explanation, MAX_LAMP_LEN), overflowText: explanation };
}

/** The follow-up message as structured data rather than a pre-rendered string.
 * The same structure is serialized twice — once as Telegram-flavoured HTML for
 * the bot to send, and once as plain text for the in-app preview — so the two
 * can never drift apart in content, only in presentation. */
export interface FollowUpModel {
  /** Full "Why?" reasoning, present only when it overflowed the lamp field. */
  whyText: string | null;
  /** Only options we actually have a supplied rationale for — never invented. */
  rationales: { label: string; text: string }[];
  keyPoint: string | null;
}

export function buildFollowUpMessage(q: NormalizedQuestion): FollowUpModel | null {
  const { overflowText } = buildQuizExplanation(q);

  const rationales = q.options
    .filter((o) => !q.correctAnswers.includes(o.label) && q.optionRationales[o.label]?.trim())
    .map((o) => ({ label: o.label, text: q.optionRationales[o.label].trim() }));

  const keyPoint = q.keyPoint?.trim() || null;

  if (!overflowText && rationales.length === 0 && !keyPoint) return null;
  return { whyText: overflowText, rationales, keyPoint };
}

/** Telegram-flavoured HTML: only <b> and <i> are used, both unconditionally
 * supported. Every dynamic fragment is escaped. */
export function renderFollowUpHtml(m: FollowUpModel): string {
  const parts: string[] = [];

  if (m.whyText) {
    parts.push("<b>Why this is correct</b>", "", escapeTelegramHtml(m.whyText));
  }

  if (m.rationales.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("<b>Why the other options are wrong</b>", "");
    for (const r of m.rationales) {
      parts.push(`<b>${escapeTelegramHtml(r.label)}</b> ${escapeTelegramHtml(r.text)}`);
    }
  }

  if (m.keyPoint) {
    if (parts.length > 0) parts.push("");
    parts.push("<b>NCLEX Key Point</b>", "", escapeTelegramHtml(m.keyPoint));
  }

  return parts.join("\n");
}

/** Plain-text rendering of the same model, for the in-app preview. Kept
 * character-for-character equivalent to the HTML version minus the tags. */
export function renderFollowUpPlain(m: FollowUpModel): string {
  const parts: string[] = [];

  if (m.whyText) {
    parts.push("Why this is correct", "", m.whyText);
  }

  if (m.rationales.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("Why the other options are wrong", "");
    for (const r of m.rationales) {
      parts.push(`${r.label} ${r.text}`);
    }
  }

  if (m.keyPoint) {
    if (parts.length > 0) parts.push("");
    parts.push("NCLEX Key Point", "", m.keyPoint);
  }

  return parts.join("\n");
}
