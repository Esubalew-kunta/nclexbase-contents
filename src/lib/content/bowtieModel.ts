import type { NormalizedBowtie, NormalizedBowtieSection } from "@/lib/content/types";

/** The three NGN bow-tie groups, left to right. How many boxes each group draws
 *  is NOT fixed: it follows the number of correct answers the question supplies
 *  (2-1-2, 3-2-3, 2-2-2, ...), so the blanks on the question slide always match
 *  what the learner has to choose. */
export const BOWTIE_COLUMNS = [
  { key: "actionsToTake", title: "Actions to Take", center: false },
  { key: "conditionMostLikely", title: "Condition Most Likely", center: true },
  { key: "parametersToMonitor", title: "Parameters to Monitor", center: false },
] as const;

export type BowtieSectionKey = (typeof BOWTIE_COLUMNS)[number]["key"];

export interface BowtieBox {
  /** Positional label, A onwards, assigned left column then centre then right.
   *  Positional rather than taken from the source JSON, because the source labels
   *  its three sections separately ("A/B", "1/2", "X/Y") and they don't form one
   *  readable run. The question and answer slides draw the same number of boxes,
   *  so box "A" on the question page is the box filled in on the answer page. */
  letter: string;
  /** 0-based position within its own column. */
  indexInColumn: number;
  isCenter: boolean;
  /** The correct answer for this box on the answer slide; null on the question
   *  slide, where the boxes are deliberately blank. */
  text: string | null;
}

export interface BowtieDiagramModel {
  columns: { key: BowtieSectionKey; title: string; isCenter: boolean; boxes: BowtieBox[] }[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function correctTexts(section: NormalizedBowtieSection): string[] {
  if (section.correctAnswers.length === 0) return [];
  const byLabel = new Map(section.options.map((o) => [o.label, o.text]));
  return section.correctAnswers.map((label) => byLabel.get(label)).filter((t): t is string => typeof t === "string");
}

/** Builds the diagram's structure for one slide.
 *
 *  Each column gets one box per correct answer (at least one, so a column never
 *  disappears on bad data). Both slides use the same count: blank on the
 *  question slide, filled with the correct answers on the answer slide. Letters
 *  run continuously across the columns in that same shape. */
export function buildBowtieDiagram(bowtie: NormalizedBowtie, mode: "question" | "answer"): BowtieDiagramModel {
  let letterIndex = 0;
  const columns = BOWTIE_COLUMNS.map((col) => {
    const correct = correctTexts(bowtie[col.key]);
    const count = Math.max(1, correct.length);
    const boxes: BowtieBox[] = Array.from({ length: count }, (_, n) => ({
      letter: LETTERS[letterIndex + n] ?? String(letterIndex + n),
      indexInColumn: n,
      isCenter: col.center,
      text: mode === "answer" ? (correct[n] ?? null) : null,
    }));
    letterIndex += count;
    return { key: col.key, title: col.title, isCenter: col.center, boxes };
  });

  return { columns };
}
