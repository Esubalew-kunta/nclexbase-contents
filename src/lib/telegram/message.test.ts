import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "@/lib/content/types";
import { checkTelegramCompatibility } from "./compat";
import { buildQuizExplanation, MAX_LAMP_LEN, truncateAtWord } from "./message";
import { buildTelegramSnapshot } from "./snapshot";

function makeQuestion(over: Partial<NormalizedQuestion> = {}): NormalizedQuestion {
  return {
    id: "q1",
    index: 1,
    type: "sata",
    category: null,
    instructions: null,
    question: "Which findings require immediate notification of the provider? (Select all that apply.)",
    options: [
      { label: "A", text: "Temperature 38.9 C" },
      { label: "B", text: "Heart rate 122" },
      { label: "C", text: "Urine output 45 mL/hr" },
      { label: "D", text: "Pain 2 of 10" },
    ],
    // A single correct answer by default: most of this file's tests are about
    // something else (lamp truncation, payload shape, ...) and shouldn't also
    // have to navigate Telegram's one-correct-answer-per-quiz limit. Tests
    // specifically about multi-answer behaviour override this.
    correctAnswers: ["A"],
    correctAnswerText: null,
    explanation: "Fever, tachycardia and oliguria all indicate deteriorating perfusion and need escalation.",
    optionRationales: { D: "Pain of 2 out of 10 is expected after ambulation and does not need escalation." },
    keyPoint: "Escalate on trends, not single values.",
    notes: null,
    format: "multiple",
    bowtie: null,
    ...over,
  };
}

describe("truncateAtWord", () => {
  it("returns short text untouched", () => {
    expect(truncateAtWord("short enough", 200)).toBe("short enough");
  });

  it("never exceeds the limit", () => {
    const long = "word ".repeat(200);
    expect(truncateAtWord(long, 200).length).toBeLessThanOrEqual(200);
  });

  it("cuts on a word boundary rather than mid-word", () => {
    const result = truncateAtWord("alpha beta gamma delta epsilon", 20);
    expect(result).not.toMatch(/[a-z]$/);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("still truncates a single unbreakable token that exceeds the limit", () => {
    const result = truncateAtWord("x".repeat(500), 200);
    expect(result.length).toBe(200);
  });
});

describe("buildQuizExplanation", () => {
  it("returns null for a question with no explanation", () => {
    expect(buildQuizExplanation(makeQuestion({ explanation: null }))).toEqual({ lampText: null, fullText: null, fullLength: 0, truncated: false });
  });

  it("treats whitespace-only as absent", () => {
    expect(buildQuizExplanation(makeQuestion({ explanation: "   " })).lampText).toBeNull();
  });

  it("keeps a short explanation entirely in the lamp field", () => {
    const result = buildQuizExplanation(makeQuestion());
    expect(result.lampText).toBe("Fever, tachycardia and oliguria all indicate deteriorating perfusion and need escalation.");
    expect(result.truncated).toBe(false);
    expect(result.fullLength).toBe(result.lampText!.length);
  });

  it("never exceeds the lamp cap", () => {
    const result = buildQuizExplanation(makeQuestion({ explanation: "Because ".repeat(60) }));
    expect(result.lampText!.length).toBeLessThanOrEqual(MAX_LAMP_LEN);
    expect(result.truncated).toBe(true);
  });

  it("still reports the full length so the UI can show what got cut", () => {
    const long = "Because ".repeat(60).trim();
    const result = buildQuizExplanation(makeQuestion({ explanation: long }));
    expect(result.fullText).toBe(long);
    expect(result.fullLength).toBe(long.length);
    expect(result.fullLength).toBeGreaterThan(MAX_LAMP_LEN);
  });

  it("never carries the wrong-option rationales or the key point", () => {
    // Both used to be published in a follow-up message, which meant they were
    // readable in the channel before anyone voted. The lamp is the only place
    // the explanation goes now, so nothing may smuggle them back in.
    const result = buildQuizExplanation(makeQuestion({ explanation: "Short answer." }));
    expect(result.lampText).toBe("Short answer.");
    expect(result.lampText).not.toContain("escalation");
  });
});

describe("checkTelegramCompatibility", () => {
  it("accepts a select-all question with a single correct answer", () => {
    const compat = checkTelegramCompatibility(makeQuestion());
    expect(compat.compatible).toBe(true);
    expect(compat.correctOptionIds).toEqual([0]);
  });

  it("accepts a select-all question with several correct answers", () => {
    // Bot API 10.0 added multi-correct quiz polls (correct_option_ids, plural,
    // plus allows_multiple_answers). Confirmed live.
    const compat = checkTelegramCompatibility(makeQuestion({ correctAnswers: ["A", "B", "C"] }));
    expect(compat.compatible).toBe(true);
    expect(compat.correctOptionIds).toEqual([0, 1, 2]);
  });

  it("excludes bowtie with a reason that names the image fallback", () => {
    const compat = checkTelegramCompatibility(makeQuestion({ format: "bowtie", type: "bowtie" }));
    expect(compat.compatible).toBe(false);
    expect(compat.reason).toMatch(/three separate groups/i);
    expect(compat.reason).toMatch(/image export/i);
  });

  it("excludes ordered and open formats", () => {
    expect(checkTelegramCompatibility(makeQuestion({ format: "ordered" })).compatible).toBe(false);
    expect(checkTelegramCompatibility(makeQuestion({ format: "open" })).compatible).toBe(false);
  });

  it("rejects a question with no correct answer set", () => {
    expect(checkTelegramCompatibility(makeQuestion({ correctAnswers: [] })).compatible).toBe(false);
  });

  it("rejects options over Telegram's 100-character limit", () => {
    const q = makeQuestion({ options: [{ label: "A", text: "x".repeat(101) }], correctAnswers: ["A"] });
    expect(checkTelegramCompatibility(q).compatible).toBe(false);
  });

  it("accepts exactly ten options but rejects eleven", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ label: String(i), text: `opt ${i}` }));
    expect(checkTelegramCompatibility(makeQuestion({ options: ten, correctAnswers: ["0"] })).compatible).toBe(true);
    const eleven = [...ten, { label: "x", text: "opt 10" }];
    expect(checkTelegramCompatibility(makeQuestion({ options: eleven, correctAnswers: ["0"] })).compatible).toBe(false);
  });
});

describe("buildTelegramSnapshot", () => {
  it("marks a genuinely multi-answer question as multiple", () => {
    const snapshot = buildTelegramSnapshot(makeQuestion({ correctAnswers: ["A", "B", "C"] }));
    expect(snapshot.isMultiple).toBe(true);
    expect(snapshot.correctOptionIds).toEqual([0, 1, 2]);
  });

  it("does not mark a select-all question as multiple when only one answer is correct", () => {
    // Otherwise Telegram would let the viewer pick several while grading
    // against a single answer.
    const snapshot = buildTelegramSnapshot(makeQuestion({ correctAnswers: ["A"] }));
    expect(snapshot.isMultiple).toBe(false);
    expect(snapshot.correctOptionIds).toEqual([0]);
  });

  it("marks a single-answer question as not multiple", () => {
    const q = makeQuestion({ type: "priority", format: "single", correctAnswers: ["B"] });
    expect(buildTelegramSnapshot(q).isMultiple).toBe(false);
  });

  it("produces a poll-only payload with no follow-up message", () => {
    // A follow-up would be readable in the channel before anyone votes, which
    // is exactly what the lamp field exists to avoid.
    const snapshot = buildTelegramSnapshot(makeQuestion());
    expect(Object.keys(snapshot).sort()).toEqual(["correctOptionIds", "isMultiple", "pollOptions", "question", "quizExplanation"]);
  });

  it("does not leak the key point or the wrong-option rationales into the lamp", () => {
    const snapshot = buildTelegramSnapshot(makeQuestion());
    expect(snapshot.quizExplanation).not.toContain("Escalate on trends");
    expect(snapshot.quizExplanation).not.toContain("expected after ambulation");
  });

  it("keeps the lamp explanation inside Telegram's 200-character cap", () => {
    const snapshot = buildTelegramSnapshot(makeQuestion({ explanation: "Because ".repeat(60) }));
    expect(snapshot.quizExplanation!.length).toBeLessThanOrEqual(200);
  });

  it("throws for an incompatible question rather than producing a bad snapshot", () => {
    expect(() => buildTelegramSnapshot(makeQuestion({ format: "bowtie" }))).toThrow();
  });
});
