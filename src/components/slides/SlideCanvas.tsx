import type { NormalizedQuestion } from "@/lib/content/types";
import { TEMPLATE_MODULES } from "@/components/templates";
import type { PlannedSlide, TemplateId } from "@/lib/slides/types";

const WATERMARK_TEXT = "nclexbase.com";

/** Diagonal brand watermark laid over every slide. Applied here, the one place
 *  all templates, the preview, the zoom modal and the PNG/ZIP export render
 *  through, so no template can miss it. Translucent and pointer-transparent so
 *  the content underneath stays readable and clickable. */
function Watermark() {
  // One mark, centred, rotated. At -35° its box is about 750px wide, well
  // inside the 1080px slide, so no letter reaches an edge and gets clipped.
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span
        style={{
          transform: "rotate(-35deg)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: "0.05em",
          lineHeight: 1.3,
          padding: "0 12px",
          whiteSpace: "nowrap",
          color: "rgba(14, 90, 92, 0.12)",
          userSelect: "none",
        }}
      >
        {WATERMARK_TEXT}
      </span>
    </div>
  );
}

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
  return (
    <div style={{ position: "relative", width: 1080, height: 1920, overflow: "hidden" }}>
      {slide.kind === "question" ? <template.QuestionFrame {...shared} blocks={slide.blocks} /> : <template.AnswerFrame {...shared} blocks={slide.blocks} />}
      <Watermark />
    </div>
  );
}