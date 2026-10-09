import { describe, expect, it } from "vitest";
import { parseQuestionsJson, type ParseResult } from "./normalize";
import { buildAnswerBlocks, buildQuestionBlocks } from "@/lib/slides/blocks";
import { buildBowtieDiagram } from "./bowtieModel";
import type { NormalizedQuestion } from "./types";

/** A realistic NGN bowtie: 3 options in every section (the fixed authoring
 * convention — see normalize.ts's "must have exactly 3 options" rule), boxed
 * down to 2 actions, 1 condition, 2 parameters — the shape the diagram is
 * built to render. */
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
      { label: "C", text: "Encourage oral fluids to maintain hydration" },
    ],
    correctAnswer: "B",
  },
  conditionMostLikely: {
    options: [
      { label: "1", text: "Cardiogenic shock" },
      { label: "2", text: "Pulmonary embolism" },
      { label: "3", text: "Anaphylactic shock" },
    ],
    correctAnswer: "1",
  },
  parametersToMonitor: {
    options: [
      { label: "X", text: "Urine output and daily weight" },
      { label: "Y", text: "Cardiac output and blood pressure" },
      { label: "Z", text: "Serum potassium level" },
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
    expect(bowtie.actionsToTake.options).toHaveLength(3);
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
    const multi = JSON.parse(BOWTIE_JSON) as { actionsToTake: { correctAnswer: string | string[] } };
    multi.actionsToTake.correctAnswer = ["B", "C"];
    expect(parseOne(JSON.stringify(multi)).bowtie!.actionsToTake.correctAnswers).toEqual(["B", "C"]);
  });

  it("accepts any number of options per section", () => {
    const b = JSON.parse(BOWTIE_JSON) as { actionsToTake: { options: { label: string; text: string }[] }; parametersToMonitor: { options: { label: string; text: string }[] } };
    b.actionsToTake.options.push({ label: "D", text: "Notify the provider of the oliguria" });
    b.parametersToMonitor.options.pop();
    expect(parseWithIssues(JSON.stringify(b))).toEqual([]);
  });

  it("never puts bowtie options in the flat options list", () => {
    expect(parseOne(BOWTIE_JSON).options).toEqual([]);
  });
});

describe("bowtie slide blocks", () => {
  it("emits the diagram as ONE atomic block, never one block per option", () => {
    const blocks = buildQuestionBlocks(parseOne(BOWTIE_JSON));
    // Scenario text + diagram, and nothing else. Splitting the diagram across
    // slides would break it into unrelated boxes.
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

describe("bowtie diagram shape", () => {
  const bowtie = () => parseOne(BOWTIE_JSON).bowtie!;

  it("draws one blank box per correct answer on the question slide", () => {
    // The sample has one correct answer per section, so 1-1-1.
    const model = buildBowtieDiagram(bowtie(), "question");
    expect(model.columns.map((c) => c.boxes.length)).toEqual([1, 1, 1]);
  });

  it.each([
    [[2, 1, 2]],
    [[3, 2, 3]],
    [[2, 2, 2]],
    [[1, 3, 1]],
  ])("supports a %j arrangement, identical on both slides", (counts) => {
    const b = JSON.parse(BOWTIE_JSON) as Record<string, { options: { label: string; text: string }[]; correctAnswer: string[] }>;
    const keys = ["actionsToTake", "conditionMostLikely", "parametersToMonitor"];
    keys.forEach((k, i) => {
      b[k].options = Array.from({ length: counts[i] + 1 }, (_, n) => ({ label: `L${n}`, text: `${k} option ${n}` }));
      b[k].correctAnswer = b[k].options.slice(0, counts[i]).map((o) => o.label);
    });
    const bowtie = parseOne(JSON.stringify(b)).bowtie!;
    const q = buildBowtieDiagram(bowtie, "question");
    const a = buildBowtieDiagram(bowtie, "answer");
    expect(q.columns.map((c) => c.boxes.length)).toEqual(counts);
    expect(a.columns.map((c) => c.boxes.length)).toEqual(counts);
    expect(a.columns.flatMap((c) => c.boxes.map((x) => x.text))).not.toContain(null);
    expect(q.columns.flatMap((c) => c.boxes.map((x) => x.letter))).toEqual(a.columns.flatMap((c) => c.boxes.map((x) => x.letter)));
  });

  it("uses the three NGN headings in left, centre, right order", () => {
    const model = buildBowtieDiagram(bowtie(), "answer");
    expect(model.columns.map((c) => c.title)).toEqual(["Actions to Take", "Condition Most Likely", "Parameters to Monitor"]);
  });

  it("marks only the centre column as the centre", () => {
    const model = buildBowtieDiagram(bowtie(), "answer");
    expect(model.columns.map((c) => c.isCenter)).toEqual([false, true, false]);
  });

  it("labels the boxes positionally from A, left column first", () => {
    // The source JSON labels its sections A/B/C, 1/2/3 and X/Y/Z, which are
    // three separate sequences and don't form one readable run.
    const model = buildBowtieDiagram(bowtie(), "question");
    expect(model.columns.flatMap((c) => c.boxes.map((b) => b.letter))).toEqual(["A", "B", "C"]);
  });

  it("uses the same letters for the same positions on both slides", () => {
    // Box "A" on the question page must be the box filled in on the answer page,
    // which only works because the letters come from the column position and not
    // from a counter that advances differently on each slide.
    const question = buildBowtieDiagram(bowtie(), "question");
    const answer = buildBowtieDiagram(bowtie(), "answer");
    for (const [i, col] of question.columns.entries()) {
      expect(answer.columns[i].boxes.map((b) => b.letter)).toEqual(col.boxes.slice(0, answer.columns[i].boxes.length).map((b) => b.letter));
    }
  });

  it("leaves every box empty on the question slide", () => {
    const model = buildBowtieDiagram(bowtie(), "question");
    expect(model.columns.flatMap((c) => c.boxes.map((b) => b.text))).toEqual([null, null, null]);
  });

  it("shows one filled box per correct answer on the answer slide", () => {
    // This bowtie has one correct answer per section, so the answer page is 1-1-1
    // — a blank box there would read as a mistake rather than as "not this one".
    const model = buildBowtieDiagram(bowtie(), "answer");
    expect(model.columns.map((c) => c.boxes.length)).toEqual([1, 1, 1]);
    expect(model.columns.map((c) => c.boxes[0].text)).toEqual([
      "Administer furosemide 40 mg IV push and reassess respiratory status in 30 minutes",
      "Cardiogenic shock",
      "Cardiac output and blood pressure",
    ]);
  });

  it("never leaves an answer box blank", () => {
    const model = buildBowtieDiagram(bowtie(), "answer");
    expect(model.columns.flatMap((c) => c.boxes.map((b) => b.text))).not.toContain(null);
  });

  it("shows two filled boxes when a section has two correct answers", () => {
    const multi = JSON.parse(BOWTIE_JSON) as { parametersToMonitor: { correctAnswer: string | string[] } };
    multi.parametersToMonitor.correctAnswer = ["X", "Y"];
    const model = buildBowtieDiagram(parseOne(JSON.stringify(multi)).bowtie!, "answer");
    expect(model.columns[2].boxes).toHaveLength(2);
    // Right column starts at C: left and centre take one box each.
    expect(model.columns[2].boxes.map((b) => b.letter)).toEqual(["C", "D"]);
  });

  it("never shows an incorrect option on the answer slide", () => {
    const model = buildBowtieDiagram(bowtie(), "answer");
    const shown = model.columns.flatMap((c) => c.boxes.map((b) => b.text)).filter(Boolean);
    expect(shown.join(" ")).not.toContain("semi-Fowler");
    expect(shown.join(" ")).not.toContain("Pulmonary embolism");
    expect(shown.join(" ")).not.toContain("daily weight");
  });

  it("keeps a box on the answer slide when a section has no parsable answer", () => {
    // The parser rejects this, so build the section by hand to prove the model
    // degrades safely on data that slipped through.
    const b = bowtie();
    b.conditionMostLikely.correctAnswers = [];
    const model = buildBowtieDiagram(b, "answer");
    expect(model.columns[1].boxes).toHaveLength(1);
    expect(model.columns[1].boxes[0].text).toBeNull();
  });
});

describe("attached question image", () => {
  const withImage = (position: "top" | "bottom") => ({ ...parseOne(BOWTIE_JSON), image: { src: "data:image/jpeg;base64,AAAA", width: 800, height: 400, position } });

  it("goes first when the position is top", () => {
    expect(buildQuestionBlocks(withImage("top")).map((b) => b.kind)).toEqual(["question-image", "question-text", "bowtie-diagram"]);
  });

  it("goes last when the position is bottom", () => {
    expect(buildQuestionBlocks(withImage("bottom")).map((b) => b.kind)).toEqual(["question-text", "bowtie-diagram", "question-image"]);
  });

  it("never reaches the answer slides", () => {
    expect(buildAnswerBlocks(withImage("top"), "").some((b) => (b.kind as string) === "question-image")).toBe(false);
  });
});

describe("attached answer image", () => {
  const withAnswerImage = (position: "top" | "bottom") => ({ ...parseOne(BOWTIE_JSON), answerImage: { src: "data:image/jpeg;base64,AAAA", width: 800, height: 400, position } });

  it("goes first when the position is top", () => {
    expect(buildAnswerBlocks(withAnswerImage("top"), "Join us").map((b) => b.kind)).toEqual(["answer-image", "bowtie-diagram", "why", "keypoint", "cta"]);
  });

  it("goes above the CTA banner when the position is bottom", () => {
    expect(buildAnswerBlocks(withAnswerImage("bottom"), "Join us").map((b) => b.kind)).toEqual(["bowtie-diagram", "why", "keypoint", "answer-image", "cta"]);
  });

  it("goes last when there is no CTA", () => {
    expect(buildAnswerBlocks(withAnswerImage("bottom"), "").map((b) => b.kind).at(-1)).toBe("answer-image");
  });

  it("never reaches the question slides", () => {
    expect(buildQuestionBlocks(withAnswerImage("top")).some((b) => (b.kind as string) === "answer-image")).toBe(false);
  });
});
