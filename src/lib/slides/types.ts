import type { AnswerBlock, QuestionBlock } from "./blocks";

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

export type PlannedSlide =
  | { kind: "question"; blocks: QuestionBlock[]; isContinuation: boolean; scale: number }
  | { kind: "answer"; blocks: AnswerBlock[]; isContinuation: boolean; scale: number };

export interface SlidePlan {
  questionId: string;
  templateId: TemplateId;
  slides: PlannedSlide[];
  /** Uniform scale the content was laid out at. 1 means no shrink-to-fit was
   * needed; anything below 1 means the content was too tall for the slide cap
   * at full size and was measured at a smaller scale to make it fit. Every
   * slide in a plan shares one scale so the carousel looks consistent. */
  scale: number;
}
