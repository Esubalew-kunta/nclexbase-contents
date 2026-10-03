import type { ReactNode } from "react";
import { scaledBodyWidthPercent } from "@/lib/slides/pack";
import { tierScale, type DensityTier } from "@/lib/slides/density";

/** The block column of a slide, shrunk so long content still fits within the
 *  slide cap.
 *
 *  Two independent effects, in this order:
 *
 *  - `--density-scale` reduces the *font size* of everything inside the column.
 *    It is set here rather than on the whole slide so the brand band, footer and
 *    page dots keep their designed size — a shrunk slide still reads as the same
 *    template. Card padding is unaffected too, so the layout keeps its
 *    proportions instead of looking squeezed.
 *  - `zoom` is a uniform fallback underneath it for the remainder. Chrome's
 *    `zoom` scales the containing block as well, so the width compensation is
 *    essential: without it a 936px column at zoom 0.8 renders 749px wide and
 *    leaves a visible gap down the right of the slide.
 *
 *  Density does the work in almost every case, which is the point: it shrinks the
 *  words rather than the layout. Zoom only has to cover the rounding difference. */
export function SlideContent({ scale, densityTier = "comfortable", className, children }: { scale?: number; densityTier?: DensityTier; className?: string; children: ReactNode }) {
  const density = tierScale(densityTier);
  const vars = { "--density-scale": density } as React.CSSProperties;

  if (!scale || scale >= 1) {
    return (
      <div className={className} style={vars}>
        {children}
      </div>
    );
  }
  return (
    <div className={className} style={{ ...vars, zoom: scale, width: scaledBodyWidthPercent(scale) }}>
      {children}
    </div>
  );
}