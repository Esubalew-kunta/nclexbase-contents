import type { AnswerBlock, QuestionBlock } from "./blocks";
import type { DensityTier } from "./density";

export type TemplateId = "clean-clinical" | "premium-editorial" | "modern-study";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
}

export const TEMPLATES: TemplateMeta[] = [
  { id: "modern-study", name: "Modern Study Card", tagline: "Solid teal header band, filled chip cards, fast mobile scanning." },
  { id: "clean-clinical", name: "Clean Clinical", tagline: "Bordered answer cards, strong whitespace, deep-teal labels." },
  { id: "premium-editorial", name: "Premium Editorial", tagline: "Serif headlines, hairline rules, a pull-quote correct answer." },
];

interface PlannedSlideBase {
  isContinuation: boolean;
  /** Uniform content scale chosen by shrink-to-fit. 1 means render at full size. */
  scale: number;
  /** Font-density tier this slide's content was laid out at, applied to the block
   *  column as `--density-scale`. Each side of the plan resolves its own, since a
   *  long stem and a long explanation are independent problems. */
  densityTier: DensityTier;
}

export type PlannedSlide =
  | ({ kind: "question"; blocks: QuestionBlock[] } & PlannedSlideBase)
  | ({ kind: "answer"; blocks: AnswerBlock[] } & PlannedSlideBase);

/** A block that could not be made to fit inside a slide, by any density tier or
 *  shrink-to-fit scale. The print page refuses to export while this is
 *  non-empty, so clipped text can never be published silently. */
export interface SlideOverflow {
  kind: "question" | "answer";
  blockIds: string[];
  tier: DensityTier;
}

export interface SlidePlan {
  questionId: string;
  templateId: TemplateId;
  slides: PlannedSlide[];
  /** Uniform scale the answer content was laid out at. 1 means no shrink-to-fit
   * was needed. Kept for callers that need one representative scale; each slide
   * carries its own. */
  scale: number;
  /** Empty when every block fits. Non-empty means the slide will overflow and the
   *  export must be refused. */
  overflow: SlideOverflow[];
}