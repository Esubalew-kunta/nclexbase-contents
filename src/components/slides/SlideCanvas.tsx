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
  // Both levers travel together: `scale` is the uniform zoom and `densityTier`
  // is the font-size reduction. Forwarding only the first renders the slide at a
  // size that was never measured, which is how content ends up overflowing a
  // slide the paginator had already decided fit.
  const shared = { question, isContinuation: slide.isContinuation, overallIndex, overallTotal, scale: slide.scale, densityTier: slide.densityTier };
  return slide.kind === "question" ? <template.QuestionFrame {...shared} blocks={slide.blocks} /> : <template.AnswerFrame {...shared} blocks={slide.blocks} />;
}