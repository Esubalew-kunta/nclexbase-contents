import type { ReactNode } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { TEMPLATE_MODULES } from "@/components/templates";
import type { PlannedSlide, TemplateId } from "@/lib/slides/types";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/slides/registry";

export function SlideCanvas({
  question,
  templateId,
  slide,
  overallIndex,
  overallTotal,
  countdown,
}: {
  question: NormalizedQuestion;
  templateId: TemplateId;
  slide: PlannedSlide;
  overallIndex: number;
  overallTotal: number;
  /** When set, overlays a small countdown badge — used only for the video
   * exporter's last couple of seconds on a slide, never in the normal PNG
   * export or live preview. */
  countdown?: number;
}) {
  const template = TEMPLATE_MODULES[templateId];
  const frame: ReactNode =
    slide.kind === "question" ? (
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

  if (!countdown) return frame;

  return (
    <div style={{ position: "relative", width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}>
      {frame}
      <div
        style={{
          position: "absolute",
          top: 64,
          right: 64,
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "rgba(23,49,51,0.78)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontSize: 40,
          fontWeight: 800,
          color: "#ffffff",
          border: "2px solid rgba(255,255,255,0.35)",
        }}
      >
        {countdown}
      </div>
    </div>
  );
}
