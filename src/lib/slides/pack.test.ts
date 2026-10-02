import { describe, expect, it } from "vitest";
import { MAX_ANSWER_SLIDES, MAX_QUESTION_SLIDES, mergeTrailingGroup, MIN_SCALE, packIndices, SCALE_STEPS, scaledBodyWidthPercent } from "./pack";

describe("packIndices", () => {
  it("puts everything in one group when it all fits", () => {
    expect(packIndices([100, 200, 300], 1000, 0)).toEqual([[0, 1, 2]]);
  });

  it("never reorders items", () => {
    expect(packIndices([300, 100, 100], 400, 0)).toEqual([[0, 1], [2]]);
  });

  it("starts a new group when the next item would overflow", () => {
    expect(packIndices([600, 600], 1000, 0)).toEqual([[0], [1]]);
  });

  it("accounts for the gap between items", () => {
    // 500 + 20 gap + 500 = 1020 > 1000, so they must split.
    expect(packIndices([500, 500], 1000, 20)).toEqual([[0], [1]]);
  });

  it("gives an over-tall item its own group rather than dropping it", () => {
    expect(packIndices([50, 5000, 50], 100, 0)).toEqual([[0], [1], [2]]);
  });

  it("returns one empty group for no items, so a slide is never lost", () => {
    expect(packIndices([], 100, 0)).toEqual([[]]);
  });
});

describe("SCALE_STEPS", () => {
  it("starts at full size", () => {
    expect(SCALE_STEPS[0]).toBe(1);
  });

  it("descends so the largest usable scale is always tried first", () => {
    for (let i = 1; i < SCALE_STEPS.length; i++) {
      expect(SCALE_STEPS[i]).toBeLessThan(SCALE_STEPS[i - 1]);
    }
  });

  it("never offers a scale below the legibility floor", () => {
    for (const step of SCALE_STEPS) expect(step).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("keeps type legible rather than chasing the slide cap", () => {
    expect(MIN_SCALE).toBeGreaterThanOrEqual(0.7);
  });
});

describe("scaledBodyWidthPercent", () => {
  it("is 100% at full size", () => {
    expect(scaledBodyWidthPercent(1)).toBe("100%");
  });

  it("over-widens the layout box to compensate for zoom", () => {
    // Without this the column would render narrower than the slide on every
    // shrunk slide, leaving a gap down the right edge.
    expect(scaledBodyWidthPercent(0.8)).toBe("125.0000%");
    expect(scaledBodyWidthPercent(0.5)).toBe("200.0000%");
  });

  it("keeps the rendered width constant across scales", () => {
    for (const step of SCALE_STEPS) {
      const layoutWidth = 936 * (parseFloat(scaledBodyWidthPercent(step)) / 100);
      const renderedWidth = layoutWidth * step;
      expect(Math.abs(renderedWidth - 936)).toBeLessThan(0.1);
    }
  });
});

describe("slide caps", () => {
  it("caps answers at two slides so content never spills to a third", () => {
    expect(MAX_ANSWER_SLIDES).toBe(2);
  });

  it("caps questions at two slides", () => {
    expect(MAX_QUESTION_SLIDES).toBe(2);
  });
});

describe("mergeTrailingGroup", () => {
  it("leaves a healthy layout alone", () => {
    const groups = [[0, 1], [2, 3]];
    expect(mergeTrailingGroup(groups, [100, 100, 100, 100], 1000, 0)).toBe(groups);
  });

  it("pulls the CTA down to share a slide when the last two groups fit together", () => {
    // The CTA is alone on slide 2, and slide 1 + 2 together fit in the budget.
    const heights = [100, 100, 150];
    const merged = mergeTrailingGroup([[0, 1], [2]], heights, 1000, 0);
    expect(merged).toEqual([[0, 1, 2]]);
  });

  it("leaves the CTA alone rather than overflowing when merging would not fit", () => {
    const groups = [[0, 1], [2]];
    expect(mergeTrailingGroup(groups, [500, 500, 150], 1000, 0)).toBe(groups);
  });

  it("does nothing when the last group already has content", () => {
    const groups = [[0], [1, 2]];
    expect(mergeTrailingGroup(groups, [100, 100, 100], 1000, 0)).toBe(groups);
  });

  it("does nothing with a single group", () => {
    const groups = [[0]];
    expect(mergeTrailingGroup(groups, [100], 1000, 0)).toBe(groups);
  });

  it("accounts for the gap when deciding whether to merge", () => {
    const groups = [[0], [1]];
    // 500 + 20 + 500 = 1020 > 1000.
    expect(mergeTrailingGroup(groups, [500, 500], 1000, 20)).toBe(groups);
    expect(mergeTrailingGroup([[0], [1]], [400, 400], 1000, 20)).toEqual([[0, 1]]);
  });
});

describe("shrink-to-fit end to end", () => {
  /** Simulates the hook's search: for each candidate scale, does the content
   * pack inside the caps? Chooses the largest that does. */
  function planAt(scales: Record<number, { q: number[]; a: number[] }>, budget: number, gap: number) {
    for (const step of SCALE_STEPS) {
      const measured = scales[step];
      if (!measured) continue;
      const q = packIndices(measured.q, budget, gap);
      const a = mergeTrailingGroup(packIndices(measured.a, budget, gap), measured.a, budget, gap);
      if (q.length <= MAX_QUESTION_SLIDES && a.length <= MAX_ANSWER_SLIDES) {
        return { scale: step, questionSlides: q.length, answerSlides: a.length };
      }
    }
    return null;
  }

  it("uses full size when the content already fits", () => {
    const result = planAt({ 1: { q: [100], a: [200, 200] } }, 1550, 0);
    expect(result).toEqual({ scale: 1, questionSlides: 1, answerSlides: 1 });
  });

  it("shrinks rather than adding a third answer slide", () => {
    // Three 900px blocks overflow a 1550px budget into three slides at full
    // size, but fit in two once shrunk.
    const result = planAt(
      {
        1: { q: [100], a: [900, 900, 900] },
        0.94: { q: [100], a: [850, 850, 850] },
        0.88: { q: [95], a: [700, 700, 700] },
      },
      1550,
      0,
    );
    expect(result).toEqual({ scale: 0.88, questionSlides: 1, answerSlides: 2 });
  });

  it("prefers a reflow win over a proportionally smaller scale", () => {
    // 0.7 is where the long rationale stops wrapping and collapses to one line,
    // so three blocks become two. The search must notice and jump to 0.7
    // rather than stopping at an intermediate scale.
    const result = planAt(
      {
        1: { q: [100], a: [900, 900, 900] },
        0.94: { q: [100], a: [850, 850, 850] },
        0.88: { q: [100], a: [800, 800, 800] },
        0.7: { q: [100], a: [400, 700, 700] },
      },
      1550,
      0,
    );
    expect(result).toEqual({ scale: 0.7, questionSlides: 1, answerSlides: 2 });
  });

  it("gives a single over-tall block its own slide at full size", () => {
    // Content is never dropped to satisfy the cap: a block taller than the
    // budget still renders, on a slide to itself, and shrink-to-fit is not
    // forced when there is nothing to gain.
    const result = planAt({ 1: { q: [5000], a: [5000] } }, 1550, 0);
    expect(result).toEqual({ scale: 1, questionSlides: 1, answerSlides: 1 });
  });

  it("returns null when even the smallest scale cannot fit the cap", () => {
    const tall = { q: [4000, 4000, 4000, 4000], a: [4000, 4000, 4000, 4000] };
    const result = planAt({ 1: tall, 0.7: tall }, 1550, 0);
    expect(result).toBeNull();
  });
});
