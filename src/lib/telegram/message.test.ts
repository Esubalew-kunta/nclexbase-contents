import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "@/lib/content/types";
import { checkTelegramCompatibility } from "./compat";
import { buildFollowUpMessage, buildQuizExplanation, escapeTelegramHtml, renderFollowUpHtml, renderFollowUpPlain, truncateAtWord } from "./message";
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
    correctAnswers: ["A", "B", "C"],
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

describe("escapeTelegramHtml", () => {
  it("escapes the three characters Telegram treats as markup", () => {
    expect(escapeTelegramHtml('a & b < c > d')).toBe("a &amp; b &lt; c &gt; d");
  });

  it("escapes ampersands before the entities it introduces, never double-escaping", () => {
    expect(escapeTelegramHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves quotes and slashes alone", () => {
    expect(escapeTelegramHtml('say "hi" a/b')).toBe('say "hi" a/b');
  });
});

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
    expect(buildQuizExplanation(makeQuestion({ explanation: null }))).toEqual({ lampText: null, overflowText: null });
  });

  it("treats whitespace-only as absent", () => {
    expect(buildQuizExplanation(makeQuestion({ explanation: "   " }))).toEqual({ lampText: null, overflowText: null });
  });

  it("keeps a short explanation entirely in the lamp field", () => {
    const result = buildQuizExplanation(makeQuestion());
    expect(result.lampText).toBe("Fever, tachycardia and oliguria all indicate deteriorating perfusion and need escalation.");
    expect(result.overflowText).toBeNull();
  });

  it("moves a long explanation to the follow-up and teases it in the lamp", () => {
    const long = "Because ".repeat(60);
    const result = buildQuizExplanation(makeQuestion({ explanation: long }));
    // The FULL text is preserved (only surrounding whitespace is stripped) —
    // the reasoning is never truncated away.
    expect(result.overflowText).toBe(long.trim());
    expect(result.overflowText).toHaveLength(long.trim().length);
    expect(result.lampText!.length).toBeLessThanOrEqual(200);
    expect(result.lampText!.length).toBeLessThan(result.overflowText!.length);
  });
});

describe("buildFollowUpMessage", () => {
  it("returns null when there is genuinely nothing extra to say", () => {
    const q = makeQuestion({
      explanation: null,
      keyPoint: null,
      optionRationales: {},
    });
    expect(buildFollowUpMessage(q)).toBeNull();
  });

  it("never repeats a correct option as a rationale", () => {
    const model = buildFollowUpMessage(makeQuestion())!;
    expect(model.rationales.map((r) => r.label)).toEqual(["D"]);
  });

  it("skips options that have no supplied rationale rather than inventing one", () => {
    const model = buildFollowUpMessage(makeQuestion({ optionRationales: { D: "" } }))!;
    expect(model.rationales).toEqual([]);
  });

  it("carries the full explanation when it overflowed the lamp", () => {
    const long = "Rationale ".repeat(50);
    const model = buildFollowUpMessage(makeQuestion({ explanation: long }))!;
    expect(model.whyText).toBe(long.trim());
    expect(model.whyText!.length).toBeGreaterThan(200);
  });

  it("omits the Why section when the explanation already fit in the lamp", () => {
    expect(buildFollowUpMessage(makeQuestion())!.whyText).toBeNull();
  });
});

describe("follow-up rendering", () => {
  it("escapes user text in the HTML rendering", () => {
    const model = { whyText: null, rationales: [{ label: "A", text: "give <b>push</b> & call" }], keyPoint: null };
    const html = renderFollowUpHtml(model);
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<b>push</b>");
  });

  it("uses only tags Telegram's HTML parse mode supports", () => {
    const model = { whyText: "why", rationales: [{ label: "A", text: "r" }], keyPoint: "kp" };
    const tags = renderFollowUpHtml(model).match(/<\/?([a-z]+)>/g) ?? [];
    const allowed = new Set(["b", "i", "u", "s", "code", "pre", "a", "blockquote"]);
    for (const tag of tags) {
      expect(allowed.has(tag.replace(/<\/?/, "").replace(">", ""))).toBe(true);
    }
  });

  it("bolds the section headers so they render as headers", () => {
    const model = buildFollowUpMessage(makeQuestion())!;
    const html = renderFollowUpHtml(model);
    expect(html).toContain("<b>Why the other options are wrong</b>");
    expect(html).toContain("<b>NCLEX Key Point</b>");
  });

  it("strips the tags from the plain rendering, leaving identical text", () => {
    const model = { whyText: "why text", rationales: [{ label: "A", text: "rationale" }], keyPoint: "key point" };
    const stripped = renderFollowUpHtml(model).replace(/<\/?b>/g, "");
    expect(stripped).toBe(renderFollowUpPlain(model));
  });
});

describe("checkTelegramCompatibility", () => {
  it("accepts a multi-answer question and returns every correct index", () => {
    const compat = checkTelegramCompatibility(makeQuestion());
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
    expect(buildTelegramSnapshot(makeQuestion()).isMultiple).toBe(true);
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

  it("produces the HTML follow-up the publisher now sends", () => {
    const snapshot = buildTelegramSnapshot(makeQuestion());
    expect(snapshot.followUpHtml).toContain("<b>NCLEX Key Point</b>");
    expect(snapshot.followUpText).toContain("NCLEX Key Point");
  });

  it("keeps the lamp explanation inside Telegram's 200-character cap", () => {
    const snapshot = buildTelegramSnapshot(makeQuestion({ explanation: "Because ".repeat(60) }));
    expect(snapshot.quizExplanation!.length).toBeLessThanOrEqual(200);
  });

  it("throws for an incompatible question rather than producing a bad snapshot", () => {
    expect(() => buildTelegramSnapshot(makeQuestion({ format: "bowtie" }))).toThrow();
  });
});
