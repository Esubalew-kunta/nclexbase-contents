"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { SlideCanvas } from "@/components/slides/SlideCanvas";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/slides/registry";
import type { PlannedSlide, TemplateId } from "@/lib/slides/types";

export function SlideZoomModal({
  question,
  templateId,
  slide,
  overallIndex,
  overallTotal,
  onClose,
  footer,
}: {
  question: NormalizedQuestion;
  templateId: TemplateId;
  slide: PlannedSlide;
  overallIndex: number;
  overallTotal: number;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(0.3);
  const [zoomedIn, setZoomedIn] = useState(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const recompute = () => {
      const scale = Math.min((el.clientWidth * 0.9) / SLIDE_WIDTH, (el.clientHeight * 0.9) / SLIDE_HEIGHT);
      setFitScale(scale);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Click the slide itself to zoom to true (1:1) pixel size; click it again
  // to go back to fit. Clicking anywhere else closes the modal.
  const scale = zoomedIn ? 1 : fitScale;

  return (
    <div ref={viewportRef} className="fixed inset-0 z-50 overflow-auto bg-black/90" onClick={onClose}>
      <div className="flex min-h-full min-w-full items-center justify-center p-6">
        <div
          onClick={(e) => {
            e.stopPropagation();
            setZoomedIn((z) => !z);
          }}
          style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale, flex: "0 0 auto", cursor: zoomedIn ? "zoom-out" : "zoom-in" }}
        >
          <div style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <SlideCanvas question={question} templateId={templateId} slide={slide} overallIndex={overallIndex} overallTotal={overallTotal} />
          </div>
        </div>
      </div>

      {footer && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center" onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
}
