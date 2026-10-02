"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { NormalizedQuestion } from "@/lib/content/types";
import { TEMPLATE_MODULES } from "@/components/templates";
import { buildAnswerBlocks, buildQuestionBlocks } from "./blocks";
import { MAX_ANSWER_SLIDES, mergeTrailingGroup, MIN_SCALE, packIndices, SCALE_STEPS, scaledBodyWidthPercent } from "./pack";
import type { PlannedSlide, SlidePlan, TemplateId } from "./types";

/** How far the *question* side is allowed to shrink to collapse onto one page.
 * Deliberately much tighter than the answer side's floor: a question that
 * genuinely needs two pages is fine and should stay readable, but a question
 * that misses one page by a few percent should shrink rather than strand a
 * near-empty second page. */
const MIN_QUESTION_SCALE = 0.88;

/** The page count each side is trying to reach, and the floor it may shrink to
 * before we give up and accept the extra page. */
const TARGET_QUESTION_SLIDES = 1;
const TARGET_ANSWER_SLIDES = MAX_ANSWER_SLIDES;

interface Measured {
  scale: number;
  q: number[];
  a: number[];
}

function measureHosts(container: HTMLElement): Measured[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-measure-step]"))
    .sort((a, b) => Number(b.dataset.measureStep) - Number(a.dataset.measureStep))
    .map((host) => ({
      scale: Number(host.dataset.measureStep),
      q: Array.from(host.querySelectorAll<HTMLElement>("[data-measure-q]")).map((el) => el.getBoundingClientRect().height),
      a: Array.from(host.querySelectorAll<HTMLElement>("[data-measure-a]")).map((el) => el.getBoundingClientRect().height),
    }));
}

/** Walks the candidate scales largest-first and returns the first layout that
 * reaches `target` slides, never shrinking past `floor`. If no scale gets
 * there, the layout is returned at FULL size rather than at the floor: a
 * question or answer that genuinely needs the extra page should stay as
 * readable as possible, and shrinking without saving a page is a pure loss. */
function chooseScale(measured: Measured[], floor: number, target: number, pick: (m: Measured) => number[][]) {
  const full = measured[0];
  const allowed = measured.filter((m) => m.scale >= floor - 1e-9);

  for (const m of allowed) {
    const groups = pick(m);
    if (groups.length <= target) return { scale: m.scale, groups };
  }

  return { scale: 1, groups: pick(full) };
}

/** Computes how a question's content is paginated across physical 1080x1920
 * slides for a given template, by actually rendering each block off-screen in
 * that template's real CSS and measuring it — never estimating.
 *
 * Shrink-to-fit: every candidate scale in SCALE_STEPS is rendered
 * simultaneously in hidden hosts and measured, and the largest scale that
 * still reaches the target page count wins. This has to be measured rather
 * than calculated because text reflow makes the relationship non-linear — at a
 * smaller scale a line that wrapped can stop wrapping, collapsing a block by
 * far more than the scale itself.
 *
 * The question and answer sides are resolved independently, each with its own
 * scale: the answer side must never spill to a third page (that's a hard
 * product requirement), while the question side shrinks only a little and only
 * when it is nearly fitting, so a genuinely long question stays big and
 * readable across two pages instead of being shrunk to save one.
 *
 * The same hook runs identically in the live preview and inside the Playwright
 * print page used for export, so pagination can never drift between the two. */
export function useSlidePlan(question: NormalizedQuestion | null, templateId: TemplateId, ctaText: string): { plan: SlidePlan | null; measurer: ReactNode } {
  const [plan, setPlan] = useState<SlidePlan | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const template = TEMPLATE_MODULES[templateId];

  const questionBlocks = useMemo(() => (question ? buildQuestionBlocks(question) : []), [question]);
  const answerBlocks = useMemo(() => (question ? buildAnswerBlocks(question, ctaText) : []), [question, ctaText]);

  useLayoutEffect(() => {
    if (!question) {
      setPlan(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const measured = measureHosts(container);
    if (measured.length === 0 || measured[0].q.length === 0) {
      setPlan(null);
      return;
    }

    const questionPlan = chooseScale(measured, MIN_QUESTION_SCALE, TARGET_QUESTION_SLIDES, (m) => packIndices(m.q, template.budgets.question, template.budgets.gap));

    const answerPlan = chooseScale(measured, MIN_SCALE, TARGET_ANSWER_SLIDES, (m) =>
      mergeTrailingGroup(packIndices(m.a, template.budgets.answer, template.budgets.gap), m.a, template.budgets.answer, template.budgets.gap),
    );

    const slides: PlannedSlide[] = [
      ...questionPlan.groups.map(
        (idxs, i): PlannedSlide => ({ kind: "question", blocks: idxs.map((idx) => questionBlocks[idx]), isContinuation: i > 0, scale: questionPlan.scale }),
      ),
      ...answerPlan.groups.map(
        (idxs, i): PlannedSlide => ({ kind: "answer", blocks: idxs.map((idx) => answerBlocks[idx]), isContinuation: i > 0, scale: answerPlan.scale }),
      ),
    ];

    setPlan({ questionId: question.id, templateId, slides, scale: answerPlan.scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, templateId, questionBlocks, answerBlocks, template]);

  const QuestionBlockView = template.QuestionBlockView;
  const AnswerBlockView = template.AnswerBlockView;

  const measurer =
    question && typeof document !== "undefined"
      ? createPortal(
          <div ref={containerRef} aria-hidden>
            {SCALE_STEPS.map((step) => (
              <div
                key={step}
                data-measure-step={step}
                style={{
                  position: "fixed",
                  top: 0,
                  left: -99999,
                  width: template.budgets.bodyWidth,
                  visibility: "hidden",
                  pointerEvents: "none",
                  zoom: step,
                }}
              >
                <div style={{ width: scaledBodyWidthPercent(step) }}>
                  {questionBlocks.map((b) => (
                    <div key={`q-${b.id}`} data-measure-q="true">
                      <QuestionBlockView block={b} />
                    </div>
                  ))}
                  {answerBlocks.map((b) => (
                    <div key={`a-${b.id}`} data-measure-a="true">
                      <AnswerBlockView block={b} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )
      : null;

  return { plan, measurer };
}
