/** Greedily packs items (by their measured height) into the fewest groups
 * that each fit within `budget`, in original order, never splitting an item.
 * A single item taller than the budget still gets its own group rather than
 * being dropped or shrunk — overflow is caught visually in dev, not silently
 * hidden. */
export function packIndices(heights: number[], budget: number, gap: number): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let currentHeight = 0;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const wouldAddGap = current.length > 0 ? gap : 0;
    if (current.length > 0 && currentHeight + wouldAddGap + h > budget) {
      groups.push(current);
      current = [];
      currentHeight = 0;
    }
    const gapForThis = current.length > 0 ? gap : 0;
    current.push(i);
    currentHeight += gapForThis + h;
  }

  if (current.length > 0 || groups.length === 0) {
    groups.push(current);
  }

  return groups;
}

/** Scale factors the answer content is allowed to shrink by, tried largest
 * first. The last entry is the floor: below roughly 0.7 the type stops being
 * legible on a phone, and legibility wins over keeping the slide count down —
 * at that point we accept a third answer slide rather than ship unreadable
 * text. */
export const SCALE_STEPS = [1, 0.94, 0.88, 0.82, 0.76, 0.7] as const;

export const MIN_SCALE = 0.7;

/** How many question and answer slides a question may occupy. Two answer
 * slides is the hard target: a select-all-that-apply question with long
 * rationales plus a key point plus the CTA has to land on page 2, not spill
 * to a page 3. */
export const MAX_QUESTION_SLIDES = 2;
export const MAX_ANSWER_SLIDES = 2;

/** The width a block column must lay out at, given the zoom it renders at, so
 * that it still fills the full body width once zoomed. Chrome's `zoom` scales
 * the containing block too, so without this a 936px column at zoom 0.8 would
 * render 749px wide and leave a gap on the slide. */
export function scaledBodyWidthPercent(scale: number): string {
  if (scale >= 1) return "100%";
  return `${(100 / scale).toFixed(4)}%`;
}

/** Last-resort guard for the branded CTA. If shrink-to-fit couldn't get the
 * content onto two slides, the CTA can still end up as the only block on the
 * final slide. When the last two groups would fit together within the budget,
 * merge them so the CTA shares a slide with real content instead of sitting
 * there alone. Returns the original groups unchanged when merging would
 * overflow — better a quiet slide than text under the footer. */
export function mergeTrailingGroup(groups: number[][], heights: number[], budget: number, gap: number): number[][] {
  if (groups.length < 2) return groups;
  const last = groups[groups.length - 1];
  const prev = groups[groups.length - 2];
  if (last.length !== 1 || prev.length === 0) return groups;

  const lastHeight = heights[last[0]] ?? 0;
  const prevHeight = prev.reduce((sum, i) => sum + (heights[i] ?? 0), 0) + gap * (prev.length - 1);
  if (lastHeight + gap + prevHeight <= budget) {
    return [...groups.slice(0, -2), [...prev, ...last]];
  }
  return groups;
}
