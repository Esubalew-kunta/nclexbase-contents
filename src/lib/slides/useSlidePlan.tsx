"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { NormalizedQuestion } from "@/lib/content/types";
import { TEMPLATE_MODULES } from "@/components/templates";
import { buildAnswerBlocks, buildQuestionBlocks, type AnswerBlock, type QuestionBlock } from "./blocks";
import { answerDensity, blockChars, nextTier, questionDensity, tierScale, type DensityTier } from "./density";
import { fallbackLayout, layoutsFor, MAX_ANSWER_SLIDES, MAX_QUESTION_SLIDES, mergeTrailingGroup, SCALE_STEPS, scaledBodyWidthPercent } from "./pack";
import type { PlannedSlide, SlidePlan, TemplateId } from "./types";

interface Measured {
  scale: number;
  heights: number[];
}

/** Which blocks are too tall to sit inside a slide, as text for the export
 *  guard and the dev console. */
export interface OverflowReport {
  kind: "question" | "answer";
  blockIds: string[];
  tier: DensityTier;
}

/** Steps a tier down `n` times, stopping at the tightest. Pure so the retry
 *  counter can be turned into the tier it means. */
function stepDown(tier: DensityTier, n: number): DensityTier {
  let t = tier;
  for (let i = 0; i < n; i++) {
    const next = nextTier(t);
    if (!next) break;
    t = next;
  }
  return t;
}

/** Computes how a question's content is paginated across physical 1080x1920
 * slides for a given template, by actually rendering each block off-screen in
 * that template's real CSS and measuring it — never estimating.
 *
 *  Two independent shrinking mechanisms, in this order:
 *
 *  1. **Density.** Each side counts its own characters and picks a font scale,
 *     applied as `--density-scale` inside the block column. This is the
 *     mechanism the brief asked for: the actual font size gets smaller while
 *     padding and the slide chrome stay put, so a long question looks like a
 *     shorter question rather than a squashed one. Character count is only a
 *     heuristic and cannot know how a string will actually wrap.
 *  2. **Shrink-to-fit zoom.** Each candidate zoom is rendered simultaneously in
 *     hidden hosts and measured, because reflow makes the relationship
 *     non-linear — at a smaller size a line that wrapped can stop wrapping,
 *     collapsing a block by far more than the zoom itself.
 *
 *  When neither is enough — a single block still taller than the whole slide —
 *  the plan drops to the next density tier down and measures again, rather than
 *  shipping a slide with text running past the footer. Leftover overflow is
 *  reported so the print page can refuse the export instead of publishing it.
 *
 *  Each side is measured at its OWN tier, in its own hidden host. Measuring both
 *  at one tier would be wrong in whichever direction that tier is looser: the
 *  answer side's tighter type measured at the question side's larger size
 *  reports heights it will never actually occupy, and triggers a pointless retry.
 *
 *  The same hook runs identically in the live preview and inside the Playwright
 *  print page used for export, so pagination can never drift between the two. */
export function useSlidePlan(question: NormalizedQuestion | null, templateId: TemplateId, ctaText: string): { plan: SlidePlan | null; measurer: ReactNode } {
  const [plan, setPlan] = useState<SlidePlan | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const template = TEMPLATE_MODULES[templateId];

  const questionBlocks = useMemo(() => (question ? buildQuestionBlocks(question) : []), [question]);
  const answerBlocks = useMemo(() => (question ? buildAnswerBlocks(question, ctaText) : []), [question, ctaText]);

  const questionBaseTier = useMemo(() => questionDensity(blockChars(questionBlocks)), [questionBlocks]);
  const answerBaseTier = useMemo(() => answerDensity(blockChars(answerBlocks)), [answerBlocks]);

  // How many extra steps below the character-derived tier each side has been
  // pushed. State, because dropping one re-renders the measurer at a smaller
  // font size and the whole measurement has to happen again.
  const planKey = `${question?.id ?? ""}|${templateId}|${ctaText.length}`;
  const [retries, setRetries] = useState<{ key: string; question: number; answer: number }>({ key: planKey, question: 0, answer: 0 });

  // A new question, template or CTA invalidates any pending retry. Adjusted
  // during render rather than in an effect: doing it in an effect would render
  // once with the stale retry count (measuring the previous question at the
  // wrong size) before correcting itself.
  if (retries.key !== planKey) {
    setRetries({ key: planKey, question: 0, answer: 0 });
  }

  const questionTier = stepDown(questionBaseTier, retries.question);
  const answerTier = stepDown(answerBaseTier, retries.answer);

  useLayoutEffect(() => {
    if (!question) return;
    const container = containerRef.current;
    if (!container) return;

    const read = (side: "q" | "a"): Measured[] =>
      Array.from(container.querySelectorAll<HTMLElement>(`[data-measure-side="${side}"]`))
        .sort((a, b) => Number(b.dataset.measureStep) - Number(a.dataset.measureStep))
        .map((host) => ({ scale: Number(host.dataset.measureStep), heights: Array.from(host.querySelectorAll<HTMLElement>("[data-measure-block]")).map((el) => el.getBoundingClientRect().height) }));

    const questionMeasured = read("q");
    const answerMeasured = read("a");
    if (questionMeasured.length === 0 || questionMeasured[0].heights.length === 0) return;

    // The packer returns indices into the measured array, which are used to index
    // the block list. If the two ever disagree — a stale measurer, a partial
    // commit — that produces undefined blocks and a crash on the print page,
    // which takes the export down with it. Measuring nothing is recoverable;
    // indexing out of range is not, so bail and wait for the next render.
    const countsMatch = questionMeasured.every((m) => m.heights.length === questionBlocks.length) && answerMeasured.every((m) => m.heights.length === answerBlocks.length);
    if (!countsMatch) return;

    const questionCandidates = layoutsFor(questionMeasured, template.budgets.question, template.budgets.gap, MAX_QUESTION_SLIDES);
    const answerCandidates = layoutsFor(answerMeasured, template.budgets.answer, template.budgets.gap, MAX_ANSWER_SLIDES);

    // Still no clean layout at the tightest tier available? Shrink the type
    // again and let this effect re-run against a fresh measurement. Bounded by
    // nextTier returning null once every tier is spent.
    if (questionCandidates.length === 0 && nextTier(questionTier)) {
      setRetries((prev) => ({ ...prev, question: prev.question + 1 }));
      return;
    }
    if (answerCandidates.length === 0 && nextTier(answerTier)) {
      setRetries((prev) => ({ ...prev, answer: prev.answer + 1 }));
      return;
    }

    const questionLayout = questionCandidates[0] ?? fallbackLayout(questionMeasured, template.budgets.question, template.budgets.gap);
    const answerBase = answerCandidates[0] ?? fallbackLayout(answerMeasured, template.budgets.answer, template.budgets.gap);
    const answerLayout = { ...answerBase, groups: mergeTrailingGroup(answerBase.groups, answerMeasured.find((m) => m.scale === answerBase.scale)?.heights ?? [], template.budgets.answer, template.budgets.gap) };

    const overflow: OverflowReport[] = [];
    if (questionLayout.overflow) {
      overflow.push({ kind: "question", blockIds: questionLayout.overflowing.map((i) => questionBlocks[i]?.id).filter(Boolean), tier: questionTier });
    }
    if (answerLayout.overflow) {
      overflow.push({ kind: "answer", blockIds: answerLayout.overflowing.map((i) => answerBlocks[i]?.id).filter(Boolean), tier: answerTier });
    }

    if (process.env.NODE_ENV !== "production" && overflow.length > 0) {
      // Loud in dev rather than silent in production. The real guard is the
      // print page refusing the export, which is the only path that ships pixels.
      for (const o of overflow) {
        console.warn(`Slide overflow in ${template.id}: ${o.kind} block(s) ${o.blockIds.join(", ")} do not fit at tier "${o.tier}".`);
      }
    }

    const slides: PlannedSlide[] = [
      ...questionLayout.groups.map(
        (idxs, i): PlannedSlide => ({ kind: "question", blocks: idxs.map((idx) => questionBlocks[idx]), isContinuation: i > 0, scale: questionLayout.scale, densityTier: questionTier }),
      ),
      ...answerLayout.groups.map(
        (idxs, i): PlannedSlide => ({ kind: "answer", blocks: idxs.map((idx) => answerBlocks[idx]), isContinuation: i > 0, scale: answerLayout.scale, densityTier: answerTier }),
      ),
    ];

    setPlan({ questionId: question.id, templateId, slides, scale: answerLayout.scale, overflow });
  }, [question, templateId, questionBlocks, answerBlocks, template, questionTier, answerTier]);

  const QuestionBlockView = template.QuestionBlockView;
  const AnswerBlockView = template.AnswerBlockView;

  /** One hidden host per (side, zoom): the blocks of that side, at that side's
   *  density tier, at one candidate zoom. The two sides are separate hosts
   *  because their density tiers differ; the zooms are separate hosts because
   *  each one is measured independently. */
  const measureHost = (side: "q" | "a", tier: DensityTier, blocks: (QuestionBlock | AnswerBlock)[], View: (props: { block: QuestionBlock | AnswerBlock }) => ReactNode) =>
    SCALE_STEPS.map((step) => (
      <div
        key={`${side}-${step}`}
        data-measure-side={side}
        data-measure-tier={tier}
        data-measure-step={step}
        style={{
          position: "fixed",
          top: 0,
          left: -99999,
          width: template.budgets.bodyWidth,
          visibility: "hidden",
          pointerEvents: "none",
          zoom: step,
          "--density-scale": tierScale(tier),
        } as React.CSSProperties}
      >
        <div style={{ width: scaledBodyWidthPercent(step) }}>
          {blocks.map((b) => (
            <div key={`${side}-${b.id}`} data-measure-block="true">
              <View block={b} />
            </div>
          ))}
        </div>
      </div>
    ));

  const measurer =
    question && typeof document !== "undefined"
      ? createPortal(
          <div ref={containerRef} aria-hidden>
            {measureHost("q", questionTier, questionBlocks, QuestionBlockView as (props: { block: QuestionBlock | AnswerBlock }) => ReactNode)}
            {measureHost("a", answerTier, answerBlocks, AnswerBlockView as (props: { block: QuestionBlock | AnswerBlock }) => ReactNode)}
          </div>,
          document.body,
        )
      : null;

  /* A plan belongs to the question it was measured for. Stale plans are
     withheld during render rather than cleared from an effect, which would
     otherwise flash the previous question's slides for a frame — and would need
     a setState inside the effect to do it. */
  const currentPlan = plan && plan.questionId === question?.id ? plan : null;

  return { plan: currentPlan, measurer };
}