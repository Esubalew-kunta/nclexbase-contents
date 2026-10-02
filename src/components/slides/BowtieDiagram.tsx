"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { NormalizedBowtie, NormalizedOption, NormalizedBowtieSection } from "@/lib/content/types";
import styles from "./BowtieDiagram.module.css";

/** Which of the three bowtie sections sits in which column. Left and right
 * hold the multi-select groups; the middle holds the single-choice one. */
const COLUMN_SECTIONS = [
  { key: "actionsToTake", title: "Actions to Take" },
  { key: "conditionMostLikely", title: "Condition Most Likely" },
  { key: "parametersToMonitor", title: "Parameters to Monitor" },
] as const;

/** A single connector: an elbow from one node's edge, across, and into the
 * other node's edge. Drawn as a polyline so a fan of lines converging on the
 * middle node reads correctly. */
interface Connector {
  key: string;
  points: string;
  dim: boolean;
}

function edgeOf(root: DOMRect, el: HTMLElement, side: "left" | "right") {
  const r = el.getBoundingClientRect();
  return {
    x: (side === "left" ? r.left : r.right) - root.left,
    y: r.top - root.top + r.height / 2,
  };
}

/** Routes a line from a source node's inner edge to a target node's inner
 * edge, turning in the middle of the gutter. Both nodes are vertically
 * centred in their own column, so this is always a clean three-segment elbow
 * regardless of how many options each column holds. */
function elbow(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  return `${from.x},${from.y} ${midX},${from.y} ${midX},${to.y} ${to.x},${to.y}`;
}

/** Renders a bowtie question or answer as the actual NGN diagram: two options
 * left, one in the middle, two right, joined by elbow connectors. On the
 * answer slide the correct picks are highlighted and the rest are dimmed, so
 * the three graded groups can be read at a glance.
 *
 * The connectors are drawn from measured element rectangles rather than fixed
 * percentages, so they stay attached to the cards whatever their text wraps
 * to. Measurement happens in a layout effect, which is why this is a client
 * component — but its *height* never depends on the overlay (the SVG is
 * absolutely positioned), so the paginator's off-screen height measurement is
 * unaffected by when the lines get drawn. */
export function BowtieDiagram({
  bowtie,
  mode,
  theme,
}: {
  bowtie: NormalizedBowtie;
  mode: "question" | "answer";
  theme?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      // The middle column is the hub every connector terminates at. If the
      // data is malformed and it has no node, we draw no connectors rather
      // than throwing during render.
      const target = root.querySelector<HTMLElement>('[data-node="conditionMostLikely"]');
      if (!target) {
        setConnectors([]);
        return;
      }
      const targetRect = target.getBoundingClientRect();

      const lines: Connector[] = [];
      for (const side of ["actionsToTake", "parametersToMonitor"] as const) {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[data-node="${side}"]`));
        for (const node of nodes) {
          const label = node.getAttribute("data-label") ?? node.getAttribute("data-node")!;
          const isLeft = side === "actionsToTake";
          const from = edgeOf(rootRect, node, isLeft ? "right" : "left");
          const to = { x: isLeft ? targetRect.left - rootRect.left : targetRect.right - rootRect.left, y: targetRect.top - rootRect.top + targetRect.height / 2 };
          lines.push({ key: `${side}:${label}`, points: elbow(from, to), dim: node.getAttribute("data-dim") === "true" });
        }
      }
      setConnectors(lines);
    };

    measure();
    // Re-measure once fonts settle; the connector geometry is a nicety, so it
    // is never allowed to block or throw the render.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [bowtie, mode]);

  const sectionFor = (key: (typeof COLUMN_SECTIONS)[number]["key"]): NormalizedBowtieSection => bowtie[key];

  const isDim = (section: NormalizedBowtieSection, opt: NormalizedOption) =>
    mode === "answer" && !section.correctAnswers.includes(opt.label);

  const isCorrect = (section: NormalizedBowtieSection, opt: NormalizedOption) =>
    mode === "answer" && section.correctAnswers.includes(opt.label);

  return (
    <div className={styles.root} ref={rootRef} style={theme} data-bowtie-mode={mode}>
      <svg className={styles.links} aria-hidden>
        {connectors.map((c) => (
          <polyline key={c.key} className={`${styles.link} ${c.dim ? styles.linkDim : ""}`} points={c.points} />
        ))}
      </svg>

      {COLUMN_SECTIONS.map(({ key, title }) => {
        const section = sectionFor(key);
        return (
          <div key={key} className={styles.column} data-column={key}>
            <p className={styles.heading}>{title}</p>
            {section.options.map((opt) => (
              <div
                key={opt.label}
                data-node={key}
                data-label={opt.label}
                data-dim={isDim(section, opt)}
                className={[
                  styles.node,
                  key === "conditionMostLikely" ? styles.nodeCenter : "",
                  isCorrect(section, opt) ? styles.nodeCorrect : "",
                  isDim(section, opt) ? styles.nodeDim : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.label}>{opt.label}</span>
                <p className={styles.text}>{opt.text}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
