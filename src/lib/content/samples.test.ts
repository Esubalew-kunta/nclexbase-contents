import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestionsJson } from "./normalize";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { buildTelegramSnapshot } from "@/lib/telegram/snapshot";
import { buildAnswerBlocks, buildQuestionBlocks } from "@/lib/slides/blocks";

// The files in /samples are the examples people copy from when writing new
// questions, so they have to keep passing the real validator. Without this they
// would silently rot the first time a rule changed, and the failure would only
// show up as a confusing validation message in someone's UI.
const SAMPLES_DIR = join(process.cwd(), "samples");

const sampleFiles = existsSync(SAMPLES_DIR) ? readdirSync(SAMPLES_DIR).filter((f) => f.endsWith(".json")).sort() : [];

function loadSample(file: string) {
  const { result, parseError } = parseQuestionsJson(readFileSync(join(SAMPLES_DIR, file), "utf8"));
  return { parseError, issues: result?.issues ?? [], questions: result?.questions ?? [] };
}

describe("sample question files", () => {
  it("ships at least one file per question type", () => {
    expect(sampleFiles.length).toBeGreaterThan(0);
    for (const type of ["single-answer", "sata", "bowtie"]) {
      expect(sampleFiles.some((f) => f.startsWith(type))).toBe(true);
    }
  });

  it("ships a short and a long variant of each type", () => {
    for (const type of ["single-answer", "sata", "bowtie"]) {
      expect(sampleFiles.some((f) => f.includes(`${type}.short`))).toBe(true);
      expect(sampleFiles.some((f) => f.includes(`${type}.long`))).toBe(true);
    }
  });

  it.each(sampleFiles)("%s parses with no validation problems", (file) => {
    const { parseError, issues, questions } = loadSample(file);
    expect(parseError).toBeNull();
    // A specific message here is what tells the user which field to fix.
    expect(issues.map((i) => `Q${i.questionIndex} (${i.questionId}): ${i.message}`)).toEqual([]);
    expect(questions).toHaveLength(1);
  });

  it.each(sampleFiles)("%s produces renderable slides", (file) => {
    const { questions } = loadSample(file);
    const q = questions[0];

    // Exactly one atomic diagram block for a bowtie: the columns must not be
    // split, or the connector lines break.
    if (q.format === "bowtie") {
      const qBlocks = buildQuestionBlocks(q);
      expect(qBlocks.filter((b) => b.kind === "bowtie-diagram")).toHaveLength(1);
      expect(qBlocks.filter((b) => b.kind === "option")).toHaveLength(0);
    }

    const answerBlocks = buildAnswerBlocks(q, "More NCLEX practice questions daily — link in bio");
    expect(answerBlocks.length).toBeGreaterThan(0);
    // A CTA is always present, so it can always be paged with the content.
    expect(answerBlocks.some((b) => b.kind === "cta")).toBe(true);
  });

  it("derives the expected format for each sample", () => {
    const expectations: Record<string, string> = {
      "single-answer": "single",
      sata: "multiple",
      bowtie: "bowtie",
    };
    for (const file of sampleFiles) {
      const { questions } = loadSample(file);
      const prefix = file.split(".")[0];
      expect(questions[0].format).toBe(expectations[prefix]);
    }
  });

  it("keeps the short samples within Telegram's poll limits so they can be tested end to end", () => {
    // A long question is deliberately over the limit; that is the point of it.
    // Bowtie is the one format that's never postable at all, regardless of
    // length — graded in three independent groups, no single-poll equivalent.
    // Everything else (including multi-answer SATA, since Bot API 10.0's
    // allows_multiple_answers + correct_option_ids now grade it correctly)
    // must be postable or the sample cannot exercise the quiz.
    for (const file of sampleFiles.filter((f) => f.includes(".short"))) {
      const { questions } = loadSample(file);
      const q = questions[0];
      const compat = checkTelegramCompatibility(q);
      if (q.format === "bowtie") {
        expect(compat.compatible).toBe(false);
        expect(compat.reason).toMatch(/three separate groups/i);
      } else {
        expect(compat.compatible).toBe(true);
        expect(() => buildTelegramSnapshot(q)).not.toThrow();
      }
    }
  });

  it("gives every non-correct option a rationale on the single-answer samples", () => {
    for (const file of sampleFiles.filter((f) => f.startsWith("single-answer"))) {
      const { questions } = loadSample(file);
      const q = questions[0];
      for (const opt of q.options) {
        if (opt.label === q.correctAnswers[0]) continue;
        expect(q.optionRationales[opt.label], `${file} is missing a rationale for ${opt.label}`).toBeTruthy();
      }
    }
  });
});

// Small local helper so this file doesn't depend on a Node import that could
// change shape; `existsSync` is only used to keep the suite green in an
// environment where the samples folder isn't present.
function existsSync(p: string): boolean {
  try {
    readdirSync(p);
    return true;
  } catch {
    return false;
  }
}