import Image from "next/image";
import type { AnswerBlock, QuestionBlock } from "@/lib/slides/blocks";
import type { SlideFrameProps, TemplateModule } from "@/lib/slides/registry";
import type { TemplateMeta } from "@/lib/slides/types";
import { QUESTION_LABEL, CTA_TITLE } from "@/lib/slides/chrome-copy";
import { BowtieDiagram } from "@/components/slides/BowtieDiagram";
import { bowtieTheme } from "@/components/slides/bowtieThemes";
import { PaperPlaneIcon } from "@/components/slides/PaperPlaneIcon";
import { SlideContent } from "@/components/slides/SlideContent";
import styles from "./PremiumEditorial.module.css";

const BRAND = "/brand/nclexbase-icon.png";

export const meta: TemplateMeta = {
  id: "premium-editorial",
  name: "Premium Editorial",
  tagline: "Serif headlines, hairline rules, a pull-quote correct answer.",
};

export const budgets = {
  question: 1450,
  answer: 1510,
  bodyWidth: 904,
  gap: 0,
};

function Chrome({ question, numeral, label }: { question: { category: string | null }; numeral: number; label?: string }) {
  const catText = label ?? question.category;
  return (
    <>
      <div className={styles.numeral}>{String(numeral).padStart(2, "0")}</div>
      <div className={styles.topRow}>
        <span className={styles.brandRow}>
          <Image className={styles.logo} src={BRAND} alt="" width={36} height={36} unoptimized />
          <span className={styles.brand}>NCLEXBase</span>
        </span>
      </div>
      {catText && <span className={styles.cat}>{catText}</span>}
      <div className={styles.rule} />
    </>
  );
}

export function QuestionBlockView({ block }: { block: QuestionBlock }) {
  if (block.kind === "question-text") {
    return <p className={styles.qtext}>{block.text}</p>;
  }
  if (block.kind === "bowtie-diagram") {
    return (
      <div className={styles.bowtie}>
        <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("premium-editorial")} />
      </div>
    );
  }
  return (
    <div className={styles.listRow}>
      <span className={styles.letter}>{block.label}</span>
      <span className={styles.rowText}>{block.text}</span>
    </div>
  );
}

export function AnswerBlockView({ block }: { block: AnswerBlock }) {
  switch (block.kind) {
    case "correct-single":
    case "correct-open":
      return (
        <div className={styles.quote}>
          <span className={styles.quotemark}>&ldquo;</span>
          <p className={styles.quotetext}>
            {"label" in block && <strong>{block.label}.</strong>} {block.text}
          </p>
        </div>
      );
    case "correct-multiple-item":
    case "correct-ordered-item":
      return (
        <div className={block.isFirst ? undefined : styles.itemTop}>
          <div className={styles.listRow}>
            <span className={styles.letter}>{block.kind === "correct-ordered-item" ? block.position : block.label}</span>
            <span className={styles.rowText}>{block.text}</span>
          </div>
        </div>
      );
    case "why":
      return (
        <div className={styles.sectionTop}>
          <h3 className={styles.sectionHead}>Why</h3>
          <p className={styles.p}>{block.text}</p>
        </div>
      );
    case "wrong":
      return (
        <div className={block.isFirst ? styles.sectionTop : styles.itemTop}>
          {block.isFirst && <h3 className={styles.sectionHead}>Why the other options are wrong</h3>}
          <div className={styles.listRow}>
            <span className={`${styles.letter} ${styles.letterSm}`}>{block.label}</span>
            <span className={`${styles.rowText} ${styles.rowTextSm}`}>{block.text}</span>
          </div>
        </div>
      );
    case "keypoint":
      return (
        <div className={styles.sectionTop}>
          <div className={styles.keypoint}>
            <span className={styles.kplabel}>NCLEX Key Point</span>
            <p className={styles.kptext}>{block.text}</p>
          </div>
        </div>
      );
    case "cta":
      return (
        <div className={styles.sectionTop}>
          <div className={styles.ctaBanner}>
            <span className={styles.ctaIcon}>
              <PaperPlaneIcon size={20} color="#ffffff" />
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
          <BowtieDiagram bowtie={block.bowtie} mode={block.mode} theme={bowtieTheme("premium-editorial")} />
        </div>
      );
  }
}

export function QuestionFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale }: SlideFrameProps<QuestionBlock>) {
  return (
    <div className={styles.canvas}>
      <Chrome question={question} numeral={question.index} label={QUESTION_LABEL} />
      {isContinuation && <span className={styles.contLabel}>Question, continued</span>}
      {!isContinuation && question.instructions && <p className={styles.instructions}>{question.instructions}</p>}
      <div className={styles.body}>
        <SlideContent scale={scale} className={styles.content}>
          {blocks.map((b) => (
            <QuestionBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
      </div>
      <div className={styles.footer}>
        <span className={styles.ruleSm} />
        <span className={styles.footbrand}>
          NCLEXBASE &middot; STUDY SERIES &middot; {overallIndex}/{overallTotal}
        </span>
      </div>
    </div>
  );
}

export function AnswerFrame({ question, blocks, isContinuation, overallIndex, overallTotal, scale }: SlideFrameProps<AnswerBlock>) {
  return (
    <div className={styles.canvas}>
      <Chrome question={question} numeral={question.index} />
      {isContinuation && <span className={styles.contLabel}>Answer, continued</span>}
      <div className={styles.body}>
        <SlideContent scale={scale} className={styles.content}>
          {blocks.map((b) => (
            <AnswerBlockView key={b.id} block={b} />
          ))}
        </SlideContent>
      </div>
      <div className={styles.footer}>
        <span className={styles.ruleSm} />
        <span className={styles.footbrand}>
          NCLEXBASE &middot; STUDY SERIES &middot; {overallIndex}/{overallTotal}
        </span>
      </div>
    </div>
  );
}

const premiumEditorial: TemplateModule = {
  id: "premium-editorial",
  meta,
  budgets,
  QuestionFrame,
  AnswerFrame,
  QuestionBlockView,
  AnswerBlockView,
};

export default premiumEditorial;
