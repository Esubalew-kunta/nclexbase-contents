import Image from "next/image";
import type { AnswerBlock, QuestionBlock } from "@/lib/slides/blocks";
import type { SlideFrameProps, TemplateModule } from "@/lib/slides/registry";
import type { TemplateMeta } from "@/lib/slides/types";
import { QUESTION_LABEL, CTA_TITLE } from "@/lib/slides/chrome-copy";
import { QuestionImageBlock } from "@/components/slides/QuestionImageBlock";
import { BowtieDiagram } from "@/components/slides/BowtieDiagram";
import { bowtieTheme } from "@/components/slides/bowtieThemes";
import { PaperPlaneIcon } from "@/components/slides/PaperPlaneIcon";
import { SlideContent } from "@/components/slides/SlideContent";
import styles from "./ModernStudy.module.css";

const BRAND = "/brand/nclexbase-icon.png";

export const meta: TemplateMeta = {
  id: "modern-study",
  name: "Modern Study Card",
  tagline: "Solid teal header band, filled chip cards, fast mobile scanning.",
};

export const budgets = {
  question: 1350,
  answer: 1450,
  bodyWidth: 936,
  gap: 0,
};

export function QuestionBlockView({ block }: { block: QuestionBlock }) {
  if (block.kind === "question-image") {
    return <QuestionImageBlock src={block.src} width={block.width} height={block.height} />;
  }
  if (block.kind === "question-text") {
    return <p className={styles.qtext}>{block.text}</p>;
  }
  if (block.kind === "bowtie-diagram") {
    return (
      <div className={styles.bowtie}>
        <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("modern-study")} />
      </div>
    );
  }
  return (
    <div className={styles.itemTop}>
      <div className={styles.optCard}>
        <span className={styles.badge}>{block.label}</span>
        <span className={styles.optText}>{block.text}</span>
      </div>
    </div>
  );
}

export function AnswerBlockView({ block }: { block: AnswerBlock }) {
  switch (block.kind) {
    case "answer-image":
      return <QuestionImageBlock src={block.src} width={block.width} height={block.height} />;
    case "correct-single":
    case "correct-open":
      return (
        <div className={styles.correctCard}>
          {"label" in block && <span className={styles.badge}>{block.label}</span>}
          <div>
            <span className={styles.correctLabel}>
              CORRECT ANSWER <span className={styles.check}>&#10003;</span>
            </span>
            <p className={styles.correctText}>{block.text}</p>
          </div>
        </div>
      );
    case "correct-multiple-item":
    case "correct-ordered-item":
      return (
        <div className={block.isFirst ? undefined : styles.itemTop}>
          <div className={styles.card}>
            {block.isFirst && <h3 className={styles.h}>{block.kind === "correct-ordered-item" ? "Correct Sequence" : "Correct Answers"}</h3>}
            <div className={styles.row}>
              <span className={`${styles.badge} ${styles.badgeFillSm}`}>{block.kind === "correct-ordered-item" ? block.position : block.label}</span>
              <p className={styles.pSm}>{block.text}</p>
            </div>
          </div>
        </div>
      );
    case "why":
      return (
        <div className={styles.sectionTop}>
          <div className={styles.card}>
            <h3 className={styles.h}>Why?</h3>
            <p className={styles.p}>{block.text}</p>
          </div>
        </div>
      );
    case "wrong":
      return (
        <div className={block.isFirst ? styles.sectionTop : styles.itemTop}>
          <div className={styles.card}>
            {block.isFirst && <h3 className={styles.h}>Why the other options are wrong</h3>}
            <div className={styles.row}>
              <span className={`${styles.badge} ${styles.badgeOutline}`}>{block.label}</span>
              <p className={styles.pSm}>{block.text}</p>
            </div>
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
          <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("modern-study")} />
        </div>
      );
  }
}

function Band({ question, title, isContinuation, contLabel }: { question: { category: string | null }; title: string; isContinuation: boolean; contLabel: string }) {
  return (
    <div className={styles.band}>
      <span className={styles.brandRow}>
        <Image className={styles.logo} src={BRAND} alt="" width={44} height={44} unoptimized />
        <span className={styles.brand}>NCLEXBase</span>
      </span>
      {isContinuation ? <span className={styles.contLabel}>{contLabel}</span> : question.category ? <span className={styles.cat}>{question.category}</span> : null}
      {!isContinuation && title && <span className={styles.qlabel}>{title}</span>}
    </div>
  );
}

export function QuestionFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale, densityTier }: SlideFrameProps<QuestionBlock>) {
  return (
    <div className={`${styles.canvas} ${styles.canvasTealBottom}`}>
      <Band question={question} title={QUESTION_LABEL} isContinuation={isContinuation} contLabel={`${QUESTION_LABEL} — Continued`} />
      <div className={`${styles.body} ${styles.bodyCard}`}>
        {!isContinuation && question.instructions && <p className={styles.instructions}>{question.instructions}</p>}
        <SlideContent scale={scale} densityTier={densityTier} className={styles.content}>
          {blocks.map((b) => (
            <QuestionBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
        <div className={styles.footer}>
          {Array.from({ length: overallTotal }).map((_, i) => (
            <span key={i} className={`${styles.bar} ${i === overallIndex - 1 ? styles.barActive : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnswerFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale, densityTier }: SlideFrameProps<AnswerBlock>) {
  return (
    <div className={`${styles.canvas} ${styles.canvasTealBottom}`}>
      <Band question={{ category: "ANSWER REVEAL" }} title="" isContinuation={isContinuation} contLabel="ANSWER — CONTINUED" />
      <div className={`${styles.body} ${styles.bodyCard}`}>
        <SlideContent scale={scale} densityTier={densityTier} className={styles.content}>
          {blocks.map((b) => (
            <AnswerBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
        <div className={styles.footer}>
          {Array.from({ length: overallTotal }).map((_, i) => (
            <span key={i} className={`${styles.bar} ${i === overallIndex - 1 ? styles.barActive : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

const modernStudy: TemplateModule = {
  id: "modern-study",
  meta,
  budgets,
  QuestionFrame,
  AnswerFrame,
  QuestionBlockView,
  AnswerBlockView,
};

export default modernStudy;
