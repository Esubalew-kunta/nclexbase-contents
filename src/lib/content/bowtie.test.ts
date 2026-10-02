import { describe, expect, it } from "vitest";
import { parseQuestionsJson, type ParseResult } from "./normalize";
import { buildAnswerBlocks, buildQuestionBlocks } from "@/lib/slides/blocks";
import type { NormalizedQuestion } from "./types";

/** A realistic NGN bowtie: 2 actions, 2 condition options, 2 parameters — the
 * shape the diagram is built to render. */
const BOWTIE_JSON = JSON.stringify({
  id: "bt-1",
  type: "bowtie",
  category: "Bowtie",
  question:
    "A 62-year-old male is admitted with acute decompensated heart failure. He is receiving furosemide 40 mg IV and a continuous dobutamine infusion. Findings include bilateral crackles, cool pale extremities, heart rate 118, blood pressure 88/54, urine output 20 mL over 2 hours, and increasing confusion.",
  actionsToTake: {
    options: [
      { label: "A", text: "Position in semi-Fowler's and start oxygen at 4 L via nasal cannula" },
      { label: "B", text: "Administer furosemide 40 mg IV push and reassess respiratory status in 30 minutes" },
    ],
    correctAnswer: "B",
  },
  conditionMostLikely: {
    options: [
      { label: "1", text: "Cardiogenic shock" },
      { label: "2", text: "Pulmonary embolism" },
    ],
    correctAnswer: "1",
  },
  parametersToMonitor: {
    options: [
      { label: "X", text: "Urine output and daily weight" },
      { label: "Y", text: "Cardiac output and blood pressure" },
    ],
    correctAnswer: "Y",
  },
  explanation: "Hypotension with a cold periphery, oliguria and altered mental status indicates cardiogenic shock.",
  keyPoint: "Oliguria with hypotension and a cold periphery is cardiogenic shock until proven otherwise.",
});

/** Parses and asserts the JSON was structurally accepted, so each test can get
 * straight to its subject without null-checking every call site. */
function parseOne(json: string): NormalizedQuestion {
  const { result, parseError } = parseQuestionsJson(json);
  expect(parseError).toBeNull();
  expect(result).not.toBeNull();
  return (result as ParseResult).questions[0];
}

function parseWithIssues(json: string): string[] {
  const { result, parseError } = parseQuestionsJson(json);
  expect(parseError).toBeNull();
  return (result as ParseResult).issues.map((i) => i.message);
}

describe("bowtie parsing", () => {
  it("parses a well-formed bowtie with no validation issues", () => {
    const { result, parseError } = parseQuestionsJson(BOWTIE_JSON);
    expect(parseError).toBeNull();
    expect(result!.issues).toEqual([]);
    expect(result!.questions).toHaveLength(1);
  });

  it("derives the bowtie format from the type", () => {
    expect(parseOne(BOWTIE_JSON).format).toBe("bowtie");
  });

  it("keeps all three sections with their own correct answers", () => {
    const bowtie = parseOne(BOWTIE_JSON).bowtie!;
    expect(bowtie.actionsToTake.options).toHaveLength(2);
    expect(bowtie.actionsToTake.correctAnswers).toEqual(["B"]);
    expect(bowtie.conditionMostLikely.correctAnswers).toEqual(["1"]);
    expect(bowtie.parametersToMonitor.correctAnswers).toEqual(["Y"]);
  });

  it("grades each section independently — the middle column has its own answer", () => {
    const bowtie = parseOne(BOWTIE_JSON).bowtie!;
    // Actions and parameters are separate multi-select groups, so sharing one
    // "correct answer" between them would be wrong for at least one.
    expect(bowtie.actionsToTake.correctAnswers).not.toEqual(bowtie.parametersToMonitor.correctAnswers);
  });

  it("reports a missing section instead of throwing", () => {
    const broken = JSON.parse(BOWTIE_JSON) as Record<string, unknown>;
    delete broken.parametersToMonitor;
    expect(parseWithIssues(JSON.stringify(broken)).some((m) => /missing its "parametersToMonitor" section/.test(m))).toBe(true);
  });

  it("reports a correctAnswer that matches no option in its own section", () => {
    const broken = JSON.parse(BOWTIE_JSON) as Record<string, { correctAnswer: string }>;
    (broken.conditionMostLikely as { correctAnswer: string }).correctAnswer = "Z";
    expect(parseWithIssues(JSON.stringify(broken)).some((m) => /does not match any option/.test(m))).toBe(true);
  });

  it("reports a duplicate option label within a section", () => {
    const broken = JSON.parse(BOWTIE_JSON) as { parametersToMonitor: { options: { label: string; text: string }[] } };
    broken.parametersToMonitor.options.push({ label: "X", text: "Duplicate label" });
    expect(parseWithIssues(JSON.stringify(broken)).some((m) => /duplicate option label/.test(m))).toBe(true);
  });

  it("accepts several correct answers in a multi-select section", () => {
    const multi = JSON.parse(BOWTIE_JSON) as { actionsToTake: { options: { label: string; text: string }[]; correctAnswer: string | string[] } };
    multi.actionsToTake.options.push({ label: "C", text: "Notify the provider of the oliguria" });
    multi.actionsToTake.correctAnswer = ["B", "C"];
    expect(parseOne(JSON.stringify(multi)).bowtie!.actionsToTake.correctAnswers).toEqual(["B", "C"]);
  });

  it("never puts bowtie options in the flat options list", () => {
    expect(parseOne(BOWTIE_JSON).options).toEqual([]);
  });
});

describe("bowtie slide blocks", () => {
  it("emits the diagram as ONE atomic block, never one block per option", () => {
    const blocks = buildQuestionBlocks(parseOne(BOWTIE_JSON));
    // Scenario text + diagram, and nothing else. Splitting the three columns
    // across slides would break the connector lines.
    expect(blocks).toHaveLength(2);
    expect(blocks.filter((b) => b.kind === "bowtie-diagram")).toHaveLength(1);
  });

  it("keeps the diagram out of the option list so it cannot be paginated separately", () => {
    expect(buildQuestionBlocks(parseOne(BOWTIE_JSON)).some((b) => b.kind === "option")).toBe(false);
  });

  it("uses question mode on the question slide", () => {
    const blocks = buildQuestionBlocks(parseOne(BOWTIE_JSON));
    const diagram = blocks.find((b) => b.kind === "bowtie-diagram");
    expect(diagram && diagram.mode).toBe("question");
  });

  it("uses answer mode on the answer slide so the correct picks highlight", () => {
    const blocks = buildAnswerBlocks(parseOne(BOWTIE_JSON), "");
    const diagram = blocks.find((b) => b.kind === "bowtie-diagram");
    expect(diagram && diagram.mode).toBe("answer");
  });

  it("keeps the why, key point and CTA after the diagram on the answer slide", () => {
    expect(buildAnswerBlocks(parseOne(BOWTIE_JSON), "Join us").map((b) => b.kind)).toEqual(["bowtie-diagram", "why", "keypoint", "cta"]);
  });

  it("omits the CTA entirely when the text is empty", () => {
    expect(buildAnswerBlocks(parseOne(BOWTIE_JSON), "   ").some((b) => b.kind === "cta")).toBe(false);
  });
});
