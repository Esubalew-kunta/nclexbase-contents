"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/slides/registry";

/** Renders a true 1080x1920 slide scaled down to fit its container width —
 * the same technique used in the design-direction mockups: the child renders
 * at real pixel size, we just shrink it visually, so what you see here is
 * pixel-for-pixel what gets exported. */
export function ScaledSlide({ children, maxWidth = 360, className }: { children: ReactNode; maxWidth?: number; className?: string }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(maxWidth / SLIDE_WIDTH);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const resize = () => setScale(el.clientWidth / SLIDE_WIDTH);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: "100%",
        maxWidth,
        aspectRatio: `${SLIDE_WIDTH}/${SLIDE_HEIGHT}`,
        overflow: "hidden",
        position: "relative",
        borderRadius: 14,
        border: "1px solid #e1e6e0",
        background: "#fff",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
