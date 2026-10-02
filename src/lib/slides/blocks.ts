import type { NormalizedBowtie, NormalizedQuestion } from "@/lib/content/types";

// A "block" is the smallest unit the paginator is allowed to move to a new
// slide. Each one is measured once (off-screen, in the real template CSS)
// and packed greedily — see pack.ts. We never split a block's own text, only
// decide which slide a whole block lands on. Where a section has a heading
// ("WHY THE OTHER OPTIONS ARE WRONG", "CORRECT ANSWERS"), that heading is
// baked into the *first* item of the section so it can never get stranded
// alone at the bottom of a slide with its content pushed to the next one.

export type QuestionBlock =
  | { id: string; kind: "question-text"; text: string }
  | { id: string; kind: "option"; label: string; text: string }
  // The whole bowtie is ONE block, never a series of per-option blocks: the
  // NGN diagram's connector lines are meaningless if the three columns are
  // split across slides, and splitting them would also strand the middle
  // column away from the two it connects to.
  | { id: string; kind: "bowtie-diagram"; bowtie: NormalizedBowtie; mode: "question" | "answer" };

export type AnswerBlock =
  | { id: string; kind: "correct-single"; label: string; text: string }
  | { id: string; kind: "correct-multiple-item"; label: string; text: string; isFirst: boolean }
  | { id: string; kind: "correct-ordered-item"; position: number; label: string; text: string; isFirst: boolean }
  | { id: string; kind: "correct-open"; text: string }
  | { id: string; kind: "why"; text: string }
  | { id: string; kind: "wrong"; label: string; text: string; isFirst: boolean }
  | { id: string; kind: "keypoint"; text: string }
  | { id: string; kind: "cta"; text: string }
  | { id: string; kind: "bowtie-diagram"; bowtie: NormalizedBowtie; mode: "question" | "answer" };

export function buildQuestionBlocks(q: NormalizedQuestion): QuestionBlock[] {
  const blocks: QuestionBlock[] = [{ id: "qtext", kind: "question-text", text: q.question }];

  if (q.format === "bowtie" && q.bowtie) {
    blocks.push({ id: "bowtie", kind: "bowtie-diagram", bowtie: q.bowtie, mode: "question" });
    return blocks;
  }

  for (const opt of q.options) {
    blocks.push({ id: `opt-${opt.label}`, kind: "option", label: opt.label, text: opt.text });
  }
  return blocks;
}

export function buildAnswerBlocks(q: NormalizedQuestion, ctaText: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];

  if (q.format === "bowtie" && q.bowtie) {
    blocks.push({ id: "bowtie", kind: "bowtie-diagram", bowtie: q.bowtie, mode: "answer" });
    if (q.explanation) blocks.push({ id: "why", kind: "why", text: q.explanation });
    if (q.keyPoint) blocks.push({ id: "keypoint", kind: "keypoint", text: q.keyPoint });
    if (ctaText.trim()) blocks.push({ id: "cta", kind: "cta", text: ctaText.trim() });
    return blocks;
  }

  if (q.format === "ordered") {
    const byLabel = new Map(q.options.map((o) => [o.label, o]));
    // correctAnswers holds the labels IN correct sequence — that ordering is
    // the content, not q.options' original A/B/C/D listing order.
    const sequence = q.correctAnswers.length > 0 ? q.correctAnswers : q.options.map((o) => o.label);
    sequence.forEach((label, i) => {
      const opt = byLabel.get(label);
      if (!opt) return;
      blocks.push({ id: `seq-${label}`, kind: "correct-ordered-item", position: i + 1, label: opt.label, text: opt.text, isFirst: i === 0 });
    });
  } else if (q.format === "multiple") {
    const answers = q.options.filter((o) => q.correctAnswers.includes(o.label));
    answers.forEach((opt, i) => {
      blocks.push({ id: `correct-${opt.label}`, kind: "correct-multiple-item", label: opt.label, text: opt.text, isFirst: i === 0 });
    });
  } else if (q.format === "open") {
    if (q.correctAnswerText) {
      blocks.push({ id: "correct", kind: "correct-open", text: q.correctAnswerText });
    }
  } else {
    const label = q.correctAnswers[0];
    const opt = q.options.find((o) => o.label === label);
    if (opt) {
      blocks.push({ id: "correct", kind: "correct-single", label: opt.label, text: opt.text });
    }
  }

  if (q.explanation) {
    blocks.push({ id: "why", kind: "why", text: q.explanation });
  }

  // Only options we actually have a supplied rationale for — never invented.
  // Skipped entirely for ordered/open formats, where there's no single set
  // of "wrong" options to speak of.
  if (q.format === "single" || q.format === "multiple") {
    let first = true;
    for (const opt of q.options) {
      if (q.correctAnswers.includes(opt.label)) continue;
      const rationale = q.optionRationales[opt.label];
      if (rationale) {
        blocks.push({ id: `wrong-${opt.label}`, kind: "wrong", label: opt.label, text: rationale, isFirst: first });
        first = false;
      }
    }
  }

  if (q.keyPoint) {
    blocks.push({ id: "keypoint", kind: "keypoint", text: q.keyPoint });
  }

  // Branded CTA, packed like any other block so it can never overflow —
  // it lands wherever there's room, including its own slide if there isn't.
  if (ctaText.trim()) {
    blocks.push({ id: "cta", kind: "cta", text: ctaText.trim() });
  }

  return blocks;
}
