"use client";

import { useMemo } from "react";
import type { NormalizedBowtie } from "@/lib/content/types";
import { buildBowtieDiagram } from "@/lib/content/bowtieModel";
import styles from "./BowtieDiagram.module.css";

/** Renders an NGN bow-tie as three columns of response boxes (one box per correct
 *  answer in each, so 2-1-2, 3-2-3, 2-2-2 ... all work),
 *  with the full option bank for each column listed underneath on the question
 *  slide — the viewer has no drag-and-drop UI to pick from, so the candidates
 *  have to be on the image itself, directly under the column they belong to.
 *
 *  There are no connector lines. The previous version drew elbows between the
 *  columns from measured element rectangles; they never lined up with the boxes
 *  once a column's height changed with its text, and they added nothing a learner
 *  needs — the three headings already say which group each box belongs to.
 *  Removing them also makes the component's height independent of when (or
 *  whether) measurement happens, so the off-screen measurement the paginator
 *  relies on can no longer disagree with what is drawn.
 *
 *  The two slides differ in what is inside the boxes (blank on the question,
 *  filled with the correct answers on the answer) and in the option list, which
 *  only the question slide carries — the answer slide already states the answer
 *  directly in the box, so repeating the full list under it would only add
 *  clutter. The box count is identical on both, which is what makes the pair
 *  read as the same diagram.
 *
 *  This keeps the whole thing one block (see blocks.ts): a long option bank
 *  just makes this one block taller, which the normal density-tier shrink and
 *  slide-packing already handle — the question text can land on its own slide
 *  and the diagram spill to a continuation slide exactly like any other
 *  over-length block, with no bow-tie-specific pagination needed. */
export function BowtieDiagram({ bowtie, mode, theme }: { bowtie: NormalizedBowtie; mode: "question" | "answer"; theme?: React.CSSProperties }) {
  const model = useMemo(() => buildBowtieDiagram(bowtie, mode), [bowtie, mode]);

  return (
    <div className={styles.root} style={theme} data-bowtie-mode={mode}>
      {model.columns.map((col) => (
        <div key={col.key} className={styles.column} data-column={col.key}>
          <p className={styles.heading}>{col.title}</p>
          <div className={styles.stack}>
            {col.boxes.map((box) => {
              // One letter per column, not per box: it sits on the seam between the
              // column's top and bottom boxes. With three or more boxes it takes the
              // middle seam; a lone box has no seam, so it sits on that box's top edge.
              const seamAfter = col.boxes.length > 1 ? Math.floor((col.boxes.length - 1) / 2) : -1;
              const showLetter = col.boxes.length === 1 || box.indexInColumn === seamAfter;
              return (
                <div key={box.indexInColumn} className={`${styles.slot} ${col.boxes.length === 1 ? styles.slotSolo : styles.slotSeam}`}>
                  <div className={`${styles.box} ${box.isCenter && box.text ? styles.boxCenter : ""} ${box.text ? styles.boxFilled : ""}`}>
                    {/* A blank answer box still needs room, or the question slide's
                        boxes collapse and the two slides stop matching in shape. */}
                    {box.text ? (
                      <p className={styles.text}>
                        {box.optionLabel && <span className={styles.optionLabel}>{box.optionLabel}.{" "}</span>}
                        {box.text}
                      </p>
                    ) : (
                      <span className={styles.blank} aria-hidden />
                    )}
                  </div>
                  {showLetter && <span className={styles.columnLetter}>{box.letter}</span>}
                </div>
              );
            })}
          </div>
          {mode === "question" && (
            <div className={styles.optionList}>
              {bowtie[col.key].options.map((opt, n) => (
                <p key={`${opt.label}-${n}`} className={styles.optionCard}>
                  <span className={styles.optionBadge}>{col.optionLabels[n]}</span>
                  <span className={styles.optionText}>{opt.text}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
      {mode === "answer" && model.summary.length > 0 && (
        <p className={styles.summary}>
          {model.summary.map((s) => (
            <span key={s.letter} className={styles.summaryItem}>
              <b>{s.letter}</b> ({s.labels.join(", ")})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}