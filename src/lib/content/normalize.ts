import { rawQuestionsFileSchema, type RawBowtieSectionParsed, type RawQuestionParsed } from "./schema";
import { CATEGORY_LABELS, KNOWN_TYPES, TYPE_FORMAT, type NormalizedBowtie, type NormalizedBowtieSection, type NormalizedQuestion, type SlideFormat } from "./types";

export interface ValidationIssue {
  questionIndex: number; // 1-based, matches the "Question 04" style messages the spec asks for
  questionId: string;
  message: string;
}

export interface ParseResult {
  questions: NormalizedQuestion[];
  issues: ValidationIssue[];
}

// "type" is authoritative (spec: "do not use AI to infer or rewrite the
// question type"). It drives both the NCLEXBase renderer and the Telegram
// poll from the same JSON, so it's required and validated against the known
// set rather than guessed — see KNOWN_TYPES in content/types.ts.
function deriveFormat(type: string, hasOptions: boolean, correctCount: number): SlideFormat {
  const mapped = TYPE_FORMAT[type];
  if (mapped === "bowtie") return "bowtie";
  if (mapped === "ordered") return "ordered";
  if (!hasOptions) return "open";
  if (mapped === "multiple") return "multiple";
  if (correctCount > 1) return "multiple";
  return "single";
}

function deriveCategoryLine(q: RawQuestionParsed): string | null {
  if (q.category) return q.category;
  if (q.type && CATEGORY_LABELS[q.type]) return CATEGORY_LABELS[q.type];
  return null;
}

/** Validates one bowtie section (its own lettered options + its own
 * correctAnswer, independent of every other section) and returns the
 * normalized section, pushing any problem onto `localIssues` instead of
 * throwing — a bowtie question can have problems in more than one section
 * at once and we want to report all of them together. */
function normalizeBowtieSection(section: RawBowtieSectionParsed | undefined, name: string, localIssues: string[]): NormalizedBowtieSection | null {
  if (!section) {
    localIssues.push(`bowtie question is missing its "${name}" section`);
    return null;
  }
  if (section.options.length !== 3) {
    localIssues.push(`"${name}" must have exactly 3 options, got ${section.options.length}`);
  }
  const labels = new Set<string>();
  for (const opt of section.options) {
    if (labels.has(opt.label)) localIssues.push(`"${name}" has a duplicate option label "${opt.label}"`);
    labels.add(opt.label);
  }
  const rawCorrect = Array.isArray(section.correctAnswer) ? section.correctAnswer : [section.correctAnswer];
  for (const ans of rawCorrect) {
    if (!labels.has(ans)) localIssues.push(`"${name}".correctAnswer "${ans}" does not match any option in that section`);
  }
  if (rawCorrect.length === 0) localIssues.push(`"${name}" has no correctAnswer`);
  return { options: section.options, correctAnswers: rawCorrect.filter((a) => labels.has(a)) };
}

/** Parses raw JSON text (single question object or an array) into the normalized
 * content model. Never rewrites supplied text — only restructures it. Returns
 * every structural problem found instead of throwing on the first one, so the
 * caller can show the user a complete list (per spec section 21). */
export function parseQuestionsJson(jsonText: string): { result: ParseResult | null; parseError: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    return { result: null, parseError: err instanceof Error ? err.message : "Invalid JSON" };
  }

  const shapeCheck = rawQuestionsFileSchema.safeParse(raw);
  if (!shapeCheck.success) {
    const first = shapeCheck.error.issues[0];
    const path = first.path.join(".");
    return {
      result: null,
      parseError: path ? `${path}: ${first.message}` : first.message,
    };
  }

  const list: RawQuestionParsed[] = Array.isArray(shapeCheck.data) ? shapeCheck.data : [shapeCheck.data];

  const issues: ValidationIssue[] = [];
  const questions: NormalizedQuestion[] = [];

  list.forEach((q, i) => {
    const questionIndex = i + 1;
    const questionId = q.id !== undefined ? String(q.id) : String(questionIndex);
    const localIssues: string[] = [];

    if (!q.type) {
      localIssues.push('missing required field "type" — set it to "priority", "sata", or "bowtie"');
    } else if (!KNOWN_TYPES.includes(q.type)) {
      localIssues.push(`unsupported type "${q.type}" — use "priority", "sata", "bowtie", or another supported type`);
    }

    // Bowtie is structurally different (three independent option groups) —
    // handle it entirely separately from the flat options/correctAnswer path.
    if (q.type === "bowtie") {
      const actionsToTake = normalizeBowtieSection(q.actionsToTake, "actionsToTake", localIssues);
      const conditionMostLikely = normalizeBowtieSection(q.conditionMostLikely, "conditionMostLikely", localIssues);
      const parametersToMonitor = normalizeBowtieSection(q.parametersToMonitor, "parametersToMonitor", localIssues);

      if (localIssues.length > 0) {
        for (const message of localIssues) issues.push({ questionIndex, questionId, message });
        return;
      }

      const bowtie: NormalizedBowtie = {
        actionsToTake: actionsToTake!,
        conditionMostLikely: conditionMostLikely!,
        parametersToMonitor: parametersToMonitor!,
      };

      questions.push({
        id: questionId,
        index: questionIndex,
        type: q.type,
        category: deriveCategoryLine(q),
        instructions: q.instructions ?? "For each section below, select the correct option(s).",
        question: q.question,
        options: [],
        correctAnswers: [],
        correctAnswerText: null,
        explanation: q.explanation ?? null,
        optionRationales: q.optionRationales ?? {},
        keyPoint: q.keyPoint ?? null,
        notes: q.notes ?? null,
        format: "bowtie",
        bowtie,
      });
      return;
    }

    const options = q.options ?? [];
    const optionLabels = new Set<string>();
    for (const opt of options) {
      if (optionLabels.has(opt.label)) {
        localIssues.push(`duplicate option label "${opt.label}"`);
      }
      optionLabels.add(opt.label);
    }

    const rawCorrect = q.correctAnswer === undefined ? [] : Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
    let correctAnswers: string[] = [];
    let correctAnswerText: string | null = null;

    if (options.length > 0) {
      for (const ans of rawCorrect) {
        if (!optionLabels.has(ans)) {
          localIssues.push(`correctAnswer "${ans}" does not match any provided option`);
        }
      }
      correctAnswers = rawCorrect.filter((a) => optionLabels.has(a));
    } else if (rawCorrect.length > 0) {
      // No lettered options supplied (e.g. a calculation question) — treat the
      // single correctAnswer entry as the answer text itself.
      correctAnswerText = rawCorrect[0];
    }

    if (q.type === "priority" && correctAnswers.length !== 1) {
      localIssues.push(`"priority" questions must have exactly one correctAnswer (choose the best/first action) — got ${correctAnswers.length}`);
    }

    if (q.optionRationales) {
      for (const label of Object.keys(q.optionRationales)) {
        if (options.length > 0 && !optionLabels.has(label)) {
          localIssues.push(`optionRationales has a rationale for "${label}", which is not a provided option`);
        }
      }
    }

    if (options.length === 1) {
      localIssues.push("only one option was provided — add more options or omit \"options\" entirely for an open-ended question");
    }

    if (localIssues.length > 0) {
      for (const message of localIssues) {
        issues.push({ questionIndex, questionId, message });
      }
      return; // don't include a structurally broken question in the output
    }

    const format = deriveFormat(q.type!, options.length > 0, correctAnswers.length);

    questions.push({
      id: questionId,
      index: questionIndex,
      type: q.type!,
      category: deriveCategoryLine(q),
      instructions: q.instructions ?? (format === "multiple" ? "Select all that apply." : null),
      question: q.question,
      options,
      correctAnswers,
      correctAnswerText,
      explanation: q.explanation ?? null,
      optionRationales: q.optionRationales ?? {},
      keyPoint: q.keyPoint ?? null,
      notes: q.notes ?? null,
      format,
      bowtie: null,
    });
  });

  return { result: { questions, issues }, parseError: null };
}
