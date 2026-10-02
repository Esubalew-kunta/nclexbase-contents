import type { NormalizedQuestion } from "@/lib/content/types";
import { TEMPLATE_MODULES } from "@/components/templates";
import type { PlannedSlide, TemplateId } from "@/lib/slides/types";

export function SlideCanvas({
  question,
  templateId,
  slide,
  overallIndex,
  overallTotal,
}: {
  question: NormalizedQuestion;
  templateId: TemplateId;
  slide: PlannedSlide;
  overallIndex: number;
  overallTotal: number;
}) {
  const template = TEMPLATE_MODULES[templateId];
  return slide.kind === "question" ? (
    <template.QuestionFrame
      question={question}
      blocks={slide.blocks}
      isContinuation={slide.isContinuation}
      overallIndex={overallIndex}
      overallTotal={overallTotal}
      scale={slide.scale}
    />
  ) : (
    <template.AnswerFrame
      question={question}
      blocks={slide.blocks}
      isContinuation={slide.isContinuation}
      overallIndex={overallIndex}
      overallTotal={overallTotal}
      scale={slide.scale}
    />
  );
}
