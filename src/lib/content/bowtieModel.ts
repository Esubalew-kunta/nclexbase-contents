import type { NormalizedBowtie, NormalizedBowtieSection } from "@/lib/content/types";

/** The NGN bow-tie has one fixed shape: two responses on the left, one in the
 *  middle, two on the right. The previous renderer drew whatever the source data
 *  happened to contain in each column and connected them with measured SVG
 *  elbows, so a section with three options grew the column and the connectors
 *  drifted off their boxes. The shape is a product requirement, so it lives in
 *  this model rather than being left to the data. */
export const BOWTIE_COLUMNS = [
  { key: "actionsToTake", title: "Actions to Take", capacity: 2, center: false },
  { key: "conditionMostLikely", title: "Condition Most Likely", capacity: 1, center: true },
  { key: "parametersToMonitor", title: "Parameters to Monitor", capacity: 2, center: false },
] as const;

export type BowtieSectionKey = (typeof BOWTIE_COLUMNS)[number]["key"];

export interface BowtieBox {
  /** Positional label, A onwards, assigned left column then centre then right.
   *  Positional rather than taken from the source JSON, because the source labels
   *  its three sections separately ("A/B", "1/2", "X/Y") and they don't form one
   *  readable run.
   *
   *  Derived from the box's position within its column and NOT from the slide
   *  mode, which is what makes a box keep the same letter when the question and
   *  answer slides show a different number of them. Box "A" on the question page
   *  is filled in on the answer page. */
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
  /** True when a section offered more options than its standard box count, so
   *  the question slide grew past the classic 2-1-2 shape. Reported rather than
   *  clipped, so a question with three options never looks like one with two. */
  extended: boolean;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function correctTexts(section: NormalizedBowtieSection): string[] {
  if (section.correctAnswers.length === 0) return [];
  const byLabel = new Map(section.options.map((o) => [o.label, o.text]));
  return section.correctAnswers.map((label) => byLabel.get(label)).filter((t): t is string => typeof t === "string");
}

/** Builds the diagram's structure for one slide.
 *
 *  The two slides differ in their box COUNT as well as their contents, and both
 *  differences are deliberate:
 *
 *  - Question slide: the fixed 2 - 1 - 2 arrangement, all blank. That shape is
 *    the format, not a consequence of the data — the middle group is a single
 *    choice whatever options it was offered, and the outer groups are two.
 *    Options beyond the box count are still listed in the question text; the
 *    boxes are the answer targets, not the option list. A section offering more
 *    options than boxes sets `extended` so the bank can say so rather than the
 *    mismatch passing unnoticed.
 *  - Answer slide: exactly one filled box per correct answer, and nothing blank.
 *    A blank box here would read as a mistake, not as "this one wasn't right".
 *
 *  Letters come from the box's position in the column, so a correct answer always
 *  lands in the box that carried its letter on the question slide. The pair still
 *  reads as the same diagram. */
export function buildBowtieDiagram(bowtie: NormalizedBowtie, mode: "question" | "answer"): BowtieDiagramModel {
  // Letters are fixed up front from the question slide's shape — the widest one
  // there can be — then each column takes the prefix it needs. Computed per
  // column rather than from a running counter, because the two slides consume
  // different numbers of boxes.
  const plan = BOWTIE_COLUMNS.map((col) => ({
    col,
    correct: correctTexts(bowtie[col.key]),
    // A section offering more options than the format's box count is unusual
    // but not invalid; flagged rather than silently narrowed.
    overfull: bowtie[col.key].options.length > col.capacity,
    // At least one box even for a section with no parsable answer, so the column
    // never disappears and the silhouette survives bad data.
    answerCount: Math.max(1, correctTexts(bowtie[col.key]).length),
  }));

  let letterStart = 0;
  const columns = plan.map((p) => {
    const start = letterStart;
    letterStart += p.col.capacity;

    const count = mode === "answer" ? p.answerCount : p.col.capacity;
    const boxes: BowtieBox[] = Array.from({ length: count }, (_, n) => ({
      letter: LETTERS[start + n] ?? String(start + n),
      indexInColumn: n,
      isCenter: p.col.center,
      text: mode === "answer" ? (p.correct[n] ?? null) : null,
    }));

    return { key: p.col.key, title: p.col.title, isCenter: p.col.center, boxes };
  });

  return { columns, extended: plan.some((p) => p.overfull) };
}