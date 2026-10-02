import type { ReactNode } from "react";
import { scaledBodyWidthPercent } from "@/lib/slides/pack";

/** The block column of a slide, optionally shrunk so long content still fits
 * within the slide cap.
 *
 * Only the block column is scaled — the header band, footer and page dots
 * always render at full size, so a shrunk slide still reads as the same
 * template. The width compensation is essential: Chrome's `zoom` scales the
 * containing block too, so without it a 936px column at 0.8 would render
 * 749px wide and leave a visible gap on the right of the slide. */
export function SlideContent({ scale, className, children }: { scale?: number; className?: string; children: ReactNode }) {
  if (!scale || scale >= 1) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={className} style={{ zoom: scale, width: scaledBodyWidthPercent(scale) }}>
      {children}
    </div>
  );
}
