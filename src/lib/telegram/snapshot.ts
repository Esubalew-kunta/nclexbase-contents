import type { NormalizedQuestion } from "@/lib/content/types";
import type { TelegramPostSnapshot } from "@/lib/supabase/schema-types";
import { checkTelegramCompatibility } from "./compat";
import { buildFollowUpMessage, buildQuizExplanation, renderFollowUpHtml, renderFollowUpPlain } from "./message";

/** Builds the frozen payload the publisher reads later, using the exact same
 * compatibility check and message builders the live preview uses — so what
 * the user previewed is what gets sent. Throws if the question isn't
 * Telegram-compatible; callers must check that first (the UI already blocks
 * scheduling incompatible questions).
 *
 * Two things are worth knowing about the shape:
 *  - `isMultiple` is what turns the poll into a genuine "select all that
 *    apply" quiz. Without it Telegram grades a multi-answer question against
 *    a single answer and marks every correct choice wrong.
 *  - both `followUpHtml` and `followUpText` are stored: the publisher sends
 *    the HTML with parse_mode set, and the plain text is kept so older
 *    snapshots (and any plain-text surface) still have something readable. */
export function buildTelegramSnapshot(q: NormalizedQuestion): TelegramPostSnapshot {
  const compat = checkTelegramCompatibility(q);
  if (!compat.compatible || !compat.correctOptionIds) {
    throw new Error(compat.reason ?? "Question is not Telegram-compatible");
  }
  const followUp = buildFollowUpMessage(q);
  return {
    question: q.question,
    pollOptions: q.options.map((o) => o.text),
    correctOptionIds: compat.correctOptionIds,
    quizExplanation: buildQuizExplanation(q).lampText,
    followUpHtml: followUp ? renderFollowUpHtml(followUp) : null,
    followUpText: followUp ? renderFollowUpPlain(followUp) : null,
    isMultiple: compat.correctOptionIds.length > 1,
  };
}
