import type { NormalizedQuestion } from "@/lib/content/types";

/** The Bot API hard-caps the quiz poll's native "explanation" field (the 💡
 *  lamp icon) at 200 characters and rejects the *entire* sendPoll call if it's
 *  longer. That cap is the reason a second "follow-up" message used to exist:
 *  the full reasoning was longer, so it travelled as its own channel post.
 *
 *  That second post is gone. It was published to the whole channel, which meant
 *  a follower could read the answer reasoning *before* casting a vote. The lamp
 *  has no such problem — Telegram only reveals it to a member once they have
 *  answered — so it is now the only place the explanation is delivered, and
 *  anything over the cap is dropped rather than spilled into a spoiler. */
export const MAX_LAMP_LEN = 200;

const LAMP_ELLIPSIS = "\u2026";

/** Truncates on a word boundary where one is reasonably close to the limit,
 *  so we never cut mid-word for a tiny gain, and never leave a stub. */
export function truncateAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const hard = trimmed.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${body.replace(/[\s,;:.-]+$/, "")}${LAMP_ELLIPSIS}`;
}

export interface QuizExplanationModel {
  /** Text for the poll's native lamp-icon field, always within the 200-char cap.
   *  Null when the question has no explanation at all. */
  lampText: string | null;
  /** The untruncated explanation. No longer published anywhere — kept so the UI
   *  can tell the admin how much of their reasoning the 200-char lamp will
   *  carry before they schedule the post. */
  fullText: string | null;
  /** How many characters of the lamp cap `fullText` occupies. Lets the preview
   *  show "148 / 200 characters" instead of silently cutting the text. */
  fullLength: number;
  /** True when part of the explanation will not fit in the lamp. */
  truncated: boolean;
}

/** Builds the one and only explanation we publish: the question's own
 *  explanation, inside the lamp cap.
 *
 *  Deliberately NOT included: the per-option "why the other options are wrong"
 *  rationales and the NCLEX key point. Both used to ride along in the follow-up
 *  message, and both would now be visible in the channel before anyone votes.
 *  They remain on the question and are still drawn on the exported images. */
export function buildQuizExplanation(q: NormalizedQuestion): QuizExplanationModel {
  const explanation = q.explanation?.trim() || null;
  if (!explanation) {
    return { lampText: null, fullText: null, fullLength: 0, truncated: false };
  }
  if (explanation.length <= MAX_LAMP_LEN) {
    return { lampText: explanation, fullText: explanation, fullLength: explanation.length, truncated: false };
  }
  return {
    lampText: truncateAtWord(explanation, MAX_LAMP_LEN),
    fullText: explanation,
    fullLength: explanation.length,
    truncated: true,
  };
}