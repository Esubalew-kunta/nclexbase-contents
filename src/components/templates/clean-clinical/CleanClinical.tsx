import Image from "next/image";
import type { AnswerBlock, QuestionBlock } from "@/lib/slides/blocks";
import type { SlideFrameProps, TemplateModule } from "@/lib/slides/registry";
import type { TemplateMeta } from "@/lib/slides/types";
import { QUESTION_LABEL, CTA_TITLE } from "@/lib/slides/chrome-copy";
import { BowtieDiagram } from "@/components/slides/BowtieDiagram";
import { bowtieTheme } from "@/components/slides/bowtieThemes";
import { PaperPlaneIcon } from "@/components/slides/PaperPlaneIcon";
import { SlideContent } from "@/components/slides/SlideContent";
import styles from "./CleanClinical.module.css";

const BRAND = "/brand/nclexbase-icon.png";

export const meta: TemplateMeta = {
  id: "clean-clinical",
  name: "Clean Clinical",
  tagline: "Bordered answer cards, strong whitespace, deep-teal labels.",
};

// Hand-computed from the fixed chrome in CleanClinical.module.css (header,
// qlabel, footer, canvas padding), with a safety margin held back so a small
// miscalculation here fails toward "one extra slide," never toward overflow.
export const budgets = {
  question: 1460,
  answer: 1520,
  bodyWidth: 912,
  gap: 0,
};

function Header({ question }: { question: { category: string | null } }) {
  return (
    <div className={styles.topRow}>
      <span className={styles.brandRow}>
        <Image className={styles.logo} src={BRAND} alt="" width={42} height={42} unoptimized />
        <span className={styles.brand}>NCLEXBase</span>
      </span>
      {question.category && <span className={styles.cat}>{question.category}</span>}
    </div>
  );
}

export function QuestionBlockView({ block }: { block: QuestionBlock }) {
  if (block.kind === "question-text") {
    return <p className={styles.qtext}>{block.text}</p>;
  }
  if (block.kind === "bowtie-diagram") {
    return (
      <div className={styles.bowtie}>
        <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("clean-clinical")} />
      </div>
    );
  }
  return (
    <div className={styles.itemTop}>
      <div className={styles.optRow}>
        <span className={styles.badge}>{block.label}</span>
        <span className={styles.optText}>{block.text}</span>
      </div>
    </div>
  );
}

export function AnswerBlockView({ block }: { block: AnswerBlock }) {
  switch (block.kind) {
    case "correct-single":
      return (
        <div className={styles.correctCard}>
          <span className={`${styles.badge} ${styles.badgeFill}`}>{block.label}</span>
          <span className={styles.correctText}>{block.text}</span>
        </div>
      );
    case "correct-open":
      return (
        <div className={styles.correctCard}>
          <span className={styles.correctText}>{block.text}</span>
        </div>
      );
    case "correct-multiple-item":
      return (
        <div className={block.isFirst ? undefined : styles.itemTop}>
          <div className={styles.correctRow}>
            <span className={`${styles.badge} ${styles.badgeSm} ${styles.badgeFill}`}>{block.label}</span>
            <p className={styles.pSm}>{block.text}</p>
          </div>
        </div>
      );
    case "correct-ordered-item":
      return (
        <div className={block.isFirst ? undefined : styles.itemTop}>
          <div className={styles.correctRow}>
            <span className={`${styles.badge} ${styles.badgeSm} ${styles.badgeFill}`}>{block.position}</span>
            <p className={styles.pSm}>{block.text}</p>
          </div>
        </div>
      );
    case "why":
      return (
        <div className={styles.sectionTop}>
          <h3 className={styles.sectionHead}>WHY?</h3>
          <p className={styles.p}>{block.text}</p>
        </div>
      );
    case "wrong":
      return (
        <div className={block.isFirst ? styles.sectionTop : styles.itemTop}>
          {block.isFirst && <h3 className={styles.sectionHead}>WHY THE OTHER OPTIONS ARE WRONG</h3>}
          <div className={styles.wrongRow}>
            <span className={`${styles.badge} ${styles.badgeSm}`}>{block.label}</span>
            <p className={styles.pSm}>{block.text}</p>
          </div>
        </div>
      );
    case "keypoint":
      return (
        <div className={styles.sectionTop}>
          <div className={styles.keypoint}>
            <span className={styles.kplabel}>NCLEX KEY POINT</span>
            <p className={styles.kptext}>{block.text}</p>
          </div>
        </div>
      );
    case "cta":
      return (
        <div className={styles.sectionTop}>
          <div className={styles.ctaBanner}>
            <span className={styles.ctaIcon}>
              <PaperPlaneIcon size={22} color="#ffffff" />
            </span>
            <div>
              <p className={styles.ctaTitle}>{CTA_TITLE}</p>
              <p className={styles.ctaSub}>{block.text}</p>
            </div>
          </div>
        </div>
      );
    case "bowtie-diagram":
      return (
        <div className={styles.bowtie}>
          <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("clean-clinical")} />
        </div>
      );
  }
}

export function QuestionFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale }: SlideFrameProps<QuestionBlock>) {
  return (
    <div className={styles.canvas}>
      <Header question={question} />
      {isContinuation ? <span className={styles.contLabel}>{QUESTION_LABEL} (CONTINUED)</span> : <span className={styles.qlabel}>{QUESTION_LABEL}</span>}
      {!isContinuation && question.instructions && <p className={styles.instructions}>{question.instructions}</p>}
      <div className={styles.body}>
        <SlideContent scale={scale} className={styles.content}>
          {blocks.map((b) => (
            <QuestionBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
      </div>
      <div className={styles.footer}>
        {Array.from({ length: overallTotal }).map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === overallIndex - 1 ? styles.dotActive : ""}`} />
        ))}
        <span className={styles.pageof}>
          {overallIndex} / {overallTotal}
        </span>
      </div>
    </div>
  );
}

const ANSWER_HEADINGS: Record<string, string> = {
  single: "CORRECT ANSWER",
  open: "CORRECT ANSWER",
  multiple: "CORRECT ANSWERS",
  ordered: "CORRECT SEQUENCE",
  bowtie: "ANSWER KEY",
};

export function AnswerFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale }: SlideFrameProps<AnswerBlock>) {
  return (
    <div className={styles.canvas}>
      <Header question={question} />
      <span className={styles.qlabel}>{isContinuation ? "ANSWER (CONTINUED)" : (ANSWER_HEADINGS[question.format] ?? "CORRECT ANSWER")}</span>
      <div className={styles.body}>
        <SlideContent scale={scale} className={styles.content}>
          {blocks.map((b) => (
            <AnswerBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
      </div>
      <div className={styles.footer}>
        {Array.from({ length: overallTotal }).map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === overallIndex - 1 ? styles.dotActive : ""}`} />
        ))}
        <span className={styles.pageof}>
          {overallIndex} / {overallTotal}
        </span>
      </div>
    </div>
  );
}

const cleanClinical: TemplateModule = {
  id: "clean-clinical",
  meta,
  budgets,
  QuestionFrame,
  AnswerFrame,
  QuestionBlockView,
  AnswerBlockView,
};

export default cleanClinical;
