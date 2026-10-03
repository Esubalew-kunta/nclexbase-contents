import { describe, expect, it } from "vitest";
import { answerDensity, blockChars, nextTier, questionDensity, TIER_SCALE, tierScale, type DensityTier } from "./density";
import type { AnswerBlock, QuestionBlock } from "./blocks";

function q(text: string): QuestionBlock {
  return { id: "qtext", kind: "question-text", text };
}
function opt(text: string): QuestionBlock {
  return { id: "opt", kind: "option", label: "A", text };
}
function why(text: string): AnswerBlock {
  return { id: "why", kind: "why", text };
}

const BOWTIE = {
  actionsToTake: {
    options: [
      { label: "A", text: "x".repeat(60) },
      { label: "B", text: "p".repeat(20) },
    ],
    correctAnswers: ["A"],
  },
  conditionMostLikely: {
    options: [
      { label: "1", text: "y".repeat(40) },
      { label: "2", text: "q".repeat(15) },
    ],
    correctAnswers: ["1"],
  },
  parametersToMonitor: { options: [{ label: "X", text: "z".repeat(30) }], correctAnswers: ["X"] },
};

describe("density tiers", () => {
  it("keeps a short question at full size", () => {
    expect(questionDensity(blockChars([q("Why is this happening?"), opt("Option one"), opt("Option two")]))).toBe("comfortable");
  });

  it("shrinks a long question", () => {
    // The shipped long sample measures ~1100 characters on the question side.
    expect(questionDensity(1100)).not.toBe("comfortable");
    expect(questionDensity(1100)).toBe("tight");
  });

  it("shrinks a long answer explanation", () => {
    expect(answerDensity(1200)).toBe("tight");
  });

  it("uses a separate budget for each side, since they are separate problems", () => {
    // A stem that is long enough to shrink the question side must not force the
    // answer side down, which has its own much longer rationales and key point.
    expect(questionDensity(700)).toBe("compact");
    expect(answerDensity(700)).toBe("compact");
    expect(questionDensity(500)).toBe("comfortable");
    expect(answerDensity(500)).toBe("comfortable");
  });

  it("only ever shrinks, never grows", () => {
    for (const tier of ["comfortable", "compact", "tight", "minimal"] as DensityTier[]) {
      expect(tierScale(tier)).toBeLessThanOrEqual(1);
    }
  });

  it("stays well above the uniform-zoom legibility floor at tight", () => {
    // Only the type shrinks at a density tier, so it can afford to stay larger
    // than the floor that a full-column zoom would hit.
    expect(tierScale("tight")).toBeGreaterThan(0.75);
  });

  it("gives very long questions their own smaller size instead of falling through to zoom", () => {
    expect(questionDensity(1800)).toBe("minimal");
    expect(answerDensity(1800)).toBe("minimal");
    expect(tierScale("minimal")).toBeLessThan(tierScale("tight"));
  });

  it("keeps the tiers strictly descending", () => {
    expect(tierScale("comfortable")).toBeGreaterThan(tierScale("compact"));
    expect(tierScale("compact")).toBeGreaterThan(tierScale("tight"));
    expect(tierScale("tight")).toBeGreaterThan(tierScale("minimal"));
  });

  it("exposes exactly one scale per tier", () => {
    expect(Object.keys(TIER_SCALE).sort()).toEqual(["comfortable", "compact", "minimal", "tight"]);
  });
});

describe("nextTier", () => {
  it("steps down one tier at a time", () => {
    expect(nextTier("comfortable")).toBe("compact");
    expect(nextTier("compact")).toBe("tight");
    expect(nextTier("tight")).toBe("minimal");
  });

  it("returns null at the smallest, which bounds the retry loop", () => {
    expect(nextTier("minimal")).toBeNull();
  });
});

describe("blockChars", () => {
  it("sums the prose across blocks", () => {
    expect(blockChars([q("abc"), opt("de"), why("f")])).toBe(6);
  });

  it("ignores structure and counts only text", () => {
    // Labels and headings take fixed space regardless of the wording; counting
    // them would shrink a question for no reason.
    expect(blockChars([opt("abcd")])).toBe(4);
  });

  it("measures a bow-tie by every option across its three columns, since the question slide lists all of them", () => {
    const blocks: QuestionBlock[] = [
      { id: "bowtie", kind: "bowtie-diagram", bowtie: BOWTIE, mode: "question" },
    ];
    // (60 + 20) + (40 + 15) + 30 = 165: every option in every column counts,
    // not just the longest one, now that the option bank is fully listed.
    expect(blockChars(blocks)).toBe(165);
  });

  it("does not crash on a bow-tie section with no options", () => {
    const empty = {
      actionsToTake: { options: [], correctAnswers: [] },
      conditionMostLikely: { options: [], correctAnswers: [] },
      parametersToMonitor: { options: [], correctAnswers: [] },
    };
    expect(blockChars([{ id: "bowtie", kind: "bowtie-diagram", bowtie: empty, mode: "question" }])).toBe(0);
  });

  it("is zero for no blocks", () => {
    expect(blockChars([])).toBe(0);
  });
});