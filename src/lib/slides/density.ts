import type { AnswerBlock, QuestionBlock } from "./blocks";

/** How much text a slide holds, and the font scale to draw it at.
 *
 *  The templates used to render every question at one fixed type size and rely
 *  on a uniform `zoom` to squeeze anything longer. Two things went wrong with
 *  that: a long question could not shrink far enough to stay on one slide, and
 *  because zoom scales the whole column — padding, gaps and card borders
 *  included — shrinking it made the layout look squeezed rather than simply
 *  smaller.
 *
 *  Density fixes both. Each side of a slide counts its own characters, picks a
 *  tier, and the tier drives a `--density-scale` custom property that only the
 *  block column inherits. Type gets smaller; the chrome (brand band, footer,
 *  page dots) and the card padding stay where they were, so the layout keeps
 *  its proportions and only the words shrink.
 *
 *  Zoom is still available as a second lever underneath this (see useSlidePlan),
 *  because tier is chosen from character counts and cannot know how a particular
 *  string will actually wrap. */
export type DensityTier = "comfortable" | "compact" | "tight" | "minimal";

/** Ordered easiest-to-smallest. `nextTier` walks down this list. */
const TIERS: readonly DensityTier[] = ["comfortable", "compact", "tight", "minimal"] as const;

/** Font scale applied at each tier. `tight` floors well above the ~0.7
 *  uniform-zoom limit because only the type shrinks here, so the slide stays
 *  legible on a phone at a smaller multiplier than zoom would need. `minimal`
 *  is allowed to sit below that zoom floor for the same reason zoom can't: it
 *  only shrinks words, never padding, gaps or card borders, so a very long
 *  question still reads as "small text" rather than "the whole card shrank". */
export const TIER_SCALE: Record<DensityTier, number> = {
  comfortable: 1,
  compact: 0.88,
  tight: 0.78,
  minimal: 0.68,
};

/** Character budgets per tier, per side. Tuned against the shipped sample
 *  questions: a short Priority/SATA/Bow-tie lands near 250-400 characters on the
 *  question side and 300-500 on the answer side, and the deliberately-long
 *  samples land near 1100-1300 and 1000-1500 — `tight` covers that whole group.
 *  `minimal` is the catch-all beyond it, for the rare question long enough that
 *  `tight` would otherwise fall through to the uniform shrink-to-fit zoom to
 *  stay on one slide; giving it its own smaller, still-legible type size keeps
 *  that case off the zoom path instead of shrinking the entire card. */
const QUESTION_BUDGET: Record<DensityTier, number> = { comfortable: 520, compact: 900, tight: 1400, minimal: Number.POSITIVE_INFINITY };
const ANSWER_BUDGET: Record<DensityTier, number> = { comfortable: 560, compact: 1000, tight: 1500, minimal: Number.POSITIVE_INFINITY };

function tierForBudget(chars: number, budget: Record<DensityTier, number>): DensityTier {
  for (const tier of TIERS) {
    if (chars <= budget[tier]) return tier;
  }
  return TIERS[TIERS.length - 1];
}

export function questionDensity(chars: number): DensityTier {
  return tierForBudget(chars, QUESTION_BUDGET);
}

export function answerDensity(chars: number): DensityTier {
  return tierForBudget(chars, ANSWER_BUDGET);
}

/** The next tier down, or null once already at the smallest. Used by the
 *  measure-and-retry loop when even the tightest tier overflows. */
export function nextTier(tier: DensityTier): DensityTier | null {
  const i = TIERS.indexOf(tier);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

export function tierScale(tier: DensityTier): number {
  return TIER_SCALE[tier];
}

/** Total characters of visible prose across a set of blocks. Punctuation and
 *  whitespace count, which is the point: they occupy the same space as letters
 *  once the text wraps, so measuring the raw string is a better predictor of
 *  height than counting words. */
export function blockChars(blocks: (QuestionBlock | AnswerBlock)[]): number {
  let total = 0;
  for (const b of blocks) {
    switch (b.kind) {
      case "question-text":
      case "correct-single":
      case "correct-multiple-item":
      case "correct-ordered-item":
      case "correct-open":
      case "why":
      case "wrong":
      case "keypoint":
      case "cta":
      case "option":
        total += b.text.length;
        break;
      case "bowtie-diagram":
        // The question slide lists every option in all three columns (the full
        // bank to choose from, not just the correct ones), so the diagram's
        // height now tracks the total option text across the whole bow-tie —
        // summing the longest box per column would badly under-estimate once a
        // column holds more than a couple of options.
        total += (["actionsToTake", "conditionMostLikely", "parametersToMonitor"] as const).reduce(
          (sum, key) => sum + b.bowtie[key].options.reduce((s, o) => s + o.text.length, 0),
          0,
        );
        break;
    }
  }
  return total;
}