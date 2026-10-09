import type { NormalizedBowtie, NormalizedBowtieSection } from "@/lib/content/types";

/** The three NGN bow-tie groups, left to right. How many boxes each group draws
 *  is NOT fixed: it follows the number of correct answers the question supplies
 *  (2-1-2, 3-2-3, 2-2-2, ...), so the blanks on the question slide always match
 *  what the learner has to choose. */
export const BOWTIE_COLUMNS = [
  { key: "actionsToTake", title: "Actions to Take", center: false, letter: "A", style: "roman" },
  { key: "conditionMostLikely", title: "Condition Most Likely", center: true, letter: "B", style: "number" },
  { key: "parametersToMonitor", title: "Parameters to Monitor", center: false, letter: "C", style: "lower" },
] as const;

export type BowtieSectionKey = (typeof BOWTIE_COLUMNS)[number]["key"];

export interface BowtieBox {
  /** The column's letter (A actions, B condition, C parameters), shared by every
   *  box in that column. The learner names the column by letter and the options
   *  by their own labels: "A (I, III)  B (2)  C (a, c)". */
  letter: string;
  /** 0-based position within its own column. */
  indexInColumn: number;
  isCenter: boolean;
  /** The correct answer for this box on the answer slide; null on the question
   *  slide, where the boxes are deliberately blank. */
  text: string | null;
  /** That answer's option label (I / 2 / c), answer slide only. */
  optionLabel: string | null;
}

export interface BowtieDiagramModel {
  columns: {
    key: BowtieSectionKey;
    title: string;
    letter: string;
    isCenter: boolean;
    boxes: BowtieBox[];
    /** Display label for each option of the column, in option order. */
    optionLabels: string[];
  }[];
  /** "A (I, III)  B (2)  C (a, c)" as data: the column letter plus the labels of
   *  its correct options. Answer slide only; empty on the question slide. */
  summary: { letter: string; labels: string[] }[];
}

export type LabelStyle = "roman" | "number" | "lower" | "upper";

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** The label shown for the n-th (0-based) option of a column in the given style.
 *  Display only: the source JSON's own labels still decide which options are
 *  correct, so existing questions keep working whatever they were labelled. */
export function optionLabel(style: LabelStyle, n: number): string {
  if (style === "number") return String(n + 1);
  if (style === "lower") return LETTERS[n % 26].toLowerCase();
  if (style === "upper") return LETTERS[n % 26];
  let rest = n + 1;
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
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
 *  question slide, filled with the correct answers on the answer slide. */
export function buildBowtieDiagram(bowtie: NormalizedBowtie, mode: "question" | "answer"): BowtieDiagramModel {
  const summary: BowtieDiagramModel["summary"] = [];
  const columns = BOWTIE_COLUMNS.map((col) => {
    const section = bowtie[col.key];
    const optionLabels = section.options.map((_, n) => optionLabel(col.style, n));
    const correct = section.correctAnswers
      .map((label) => {
        const at = section.options.findIndex((o) => o.label === label);
        return at === -1 ? null : { text: section.options[at].text, label: optionLabels[at], at };
      })
      .filter((c): c is { text: string; label: string; at: number } => c !== null);
    const count = Math.max(1, correct.length);
    const boxes: BowtieBox[] = Array.from({ length: count }, (_, n) => ({
      letter: col.letter,
      indexInColumn: n,
      isCenter: col.center,
      text: mode === "answer" ? (correct[n]?.text ?? null) : null,
      optionLabel: mode === "answer" ? (correct[n]?.label ?? null) : null,
    }));
    if (mode === "answer") summary.push({ letter: col.letter, labels: [...correct].sort((x, y) => x.at - y.at).map((c) => c.label) });
    return { key: col.key, title: col.title, letter: col.letter, isCenter: col.center, boxes, optionLabels };
  });

  return { columns, summary };
}
