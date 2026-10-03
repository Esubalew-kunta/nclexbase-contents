import type { NormalizedQuestion } from "@/lib/content/types";

export interface TelegramCompatibility {
  compatible: boolean;
  reason?: string;
  correctOptionIds?: number[];
}

const MAX_QUESTION_LEN = 300;
const MAX_OPTION_LEN = 100;
const MAX_OPTIONS = 10;

/** Telegram's quiz poll can only represent questions with real lettered
 * options and a known correct set (single or multiple-response). Bowtie is
 * excluded outright and says so: a bowtie is graded as three independent
 * groups (actions / condition / parameters), which has no equivalent in a
 * single flat poll — forcing it would post a question we know we graded
 * wrong. Ordered-response and open/calculation are likewise unrepresentable.
 * Bowtie questions remain fully available to the image export. */
export function checkTelegramCompatibility(q: NormalizedQuestion): TelegramCompatibility {
  if (q.format === "bowtie") {
    return {
      compatible: false,
      reason: "Bowtie questions are graded in three separate groups, which a single Telegram poll cannot represent. Image export is still available.",
    };
  }
  if (q.format !== "single" && q.format !== "multiple") {
    return { compatible: false, reason: `"${q.format}" questions don't map to a Telegram quiz poll (no single set of lettered correct options).` };
  }
  // A multi-answer quiz poll ("select all that apply" with grading) genuinely
  // did not exist on Telegram until Bot API 10.0 (May 2026): `correct_option_id`
  // (singular) became `correct_option_ids` (plural), and `allows_multiple_answers`
  // — previously regular-poll-only — now applies to quiz polls too. An earlier
  // version of this check rejected every multi-answer SATA question outright,
  // because the code sending it used a field name (`is_multiple`) that was
  // never real, which made Telegram refuse it with QUIZ_CORRECT_ANSWERS_TOO_MUCH
  // regardless of how many correct answers there were. Confirmed live, with the
  // corrected field names, that two or more correct options now work. See
  // sendQuizPoll for the publishing side of that fix.
  if (q.options.length === 0) {
    return { compatible: false, reason: "This question has no options to poll." };
  }
  if (q.options.length > MAX_OPTIONS) {
    return { compatible: false, reason: `Telegram polls support at most ${MAX_OPTIONS} options; this question has ${q.options.length}.` };
  }
  if (q.question.length > MAX_QUESTION_LEN) {
    return { compatible: false, reason: `Telegram poll questions are limited to ${MAX_QUESTION_LEN} characters; this one is ${q.question.length}.` };
  }
  const longOption = q.options.find((o) => o.text.length > MAX_OPTION_LEN);
  if (longOption) {
    return { compatible: false, reason: `Telegram poll options are limited to ${MAX_OPTION_LEN} characters; option ${longOption.label} is ${longOption.text.length}.` };
  }
  if (q.correctAnswers.length === 0) {
    return { compatible: false, reason: "No correct answer is set for this question." };
  }

  const correctOptionIds = q.correctAnswers
    .map((label) => q.options.findIndex((o) => o.label === label))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);

  return { compatible: true, correctOptionIds };
}
