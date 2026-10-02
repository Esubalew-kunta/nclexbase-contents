import type { ComponentType } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { AnswerBlock, QuestionBlock } from "./blocks";
import type { TemplateId, TemplateMeta } from "./types";

export interface TemplateBudgets {
  /** px of vertical space available for the packed block column. */
  question: number;
  answer: number;
  /** px width the block column renders at — must match the real body column
   * exactly, since it drives text wrapping and therefore measured height. */
  bodyWidth: number;
  /** uniform flex gap (px) between consecutive blocks in the body column. */
  gap: number;
}

export interface SlideFrameProps<B> {
  question: NormalizedQuestion;
  blocks: B[];
  isContinuation: boolean;
  /** 1-based position of this slide within the whole Question+Answer set. */
  overallIndex: number;
  overallTotal: number;
  /** Uniform content scale chosen by shrink-to-fit (see useSlidePlan). 1 means
   * render at full size. Frames apply it to the block column only, never to
   * the header band or footer, which must stay at full size on every slide. */
  scale?: number;
}

export interface TemplateModule {
  id: TemplateId;
  meta: TemplateMeta;
  budgets: TemplateBudgets;
  QuestionFrame: ComponentType<SlideFrameProps<QuestionBlock>>;
  AnswerFrame: ComponentType<SlideFrameProps<AnswerBlock>>;
  QuestionBlockView: ComponentType<{ block: QuestionBlock }>;
  AnswerBlockView: ComponentType<{ block: AnswerBlock }>;
}

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1920;
