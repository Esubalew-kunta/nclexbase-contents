// Raw shape as supplied by the user's JSON. Nothing here is generated —
// every field is either present in the source JSON or omitted.
export interface RawOption {
  label: string;
  text: string;
}

// A bowtie question has three independent option groups, each with its own
// lettered options and its own correct answer(s) — scenario, actions,
// condition, and parameters are graded separately, not as one flat list.
export interface RawBowtieSection {
  options: RawOption[];
  correctAnswer: string | string[];
}

export interface RawQuestion {
  id?: string | number;
  type?: string;
  category?: string;
  instructions?: string;
  question: string;
  options?: RawOption[];
  correctAnswer?: string | string[];
  explanation?: string;
  optionRationales?: Record<string, string>;
  keyPoint?: string;
  notes?: string;
  // Bowtie-only — "question" doubles as the clinical scenario for this type.
  actionsToTake?: RawBowtieSection;
  conditionMostLikely?: RawBowtieSection;
  parametersToMonitor?: RawBowtieSection;
}

export type SlideFormat = "single" | "multiple" | "ordered" | "open" | "bowtie";

export interface NormalizedOption {
  label: string;
  text: string;
}

/** An illustration the user attached in the app (not part of the question JSON).
 *  `width`/`height` are the natural pixel size, kept so the slide can reserve the
 *  right amount of space before the picture has decoded — pagination measures
 *  block heights synchronously and an unloaded <img> would measure as zero. */
export interface QuestionImage {
  src: string;
  width: number;
  height: number;
  position: "top" | "bottom";
}

export interface NormalizedBowtieSection {
  options: NormalizedOption[];
  correctAnswers: string[];
}

export interface NormalizedBowtie {
  actionsToTake: NormalizedBowtieSection;
  conditionMostLikely: NormalizedBowtieSection;
  parametersToMonitor: NormalizedBowtieSection;
}

// The internal content model every template renders from. Produced once,
// by normalizing + validating a RawQuestion — templates never see raw JSON.
export interface NormalizedQuestion {
  id: string;
  index: number; // 1-based position within the imported batch
  type: string;
  category: string | null;
  instructions: string | null;
  question: string;
  options: NormalizedOption[];
  correctAnswers: string[]; // option labels, in correct order for "ordered"
  correctAnswerText: string | null; // used when there are no lettered options (e.g. calculation)
  explanation: string | null;
  optionRationales: Record<string, string>;
  keyPoint: string | null;
  notes: string | null;
  format: SlideFormat;
  bowtie: NormalizedBowtie | null;
  /** Optional user-attached picture, shown on the question slides only. */
  image?: QuestionImage | null;
  /** Optional user-attached picture, shown on the answer slides only. */
  answerImage?: QuestionImage | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  priority: "Priority",
  sata: "Select All That Apply",
  multiple_response: "Select All That Apply",
  bowtie: "Bowtie",
  ordered_response: "Ordered Response",
  first_action: "First Action",
  next_action: "Next Action",
  best_action: "Best Action",
  delegation: "Delegation",
  pharmacology: "Pharmacology",
  calculation: "Calculation",
  patient_teaching: "Patient Teaching",
  safety: "Safety",
  clinical_judgment: "Clinical Judgment",
  lab_value: "Lab Values",
  nursing_intervention: "Nursing Intervention",
  quick_review: "Quick Review",
  key_point: "Key Point",
  nclex_tip: "NCLEX Tip",
};

// "type" is the authoritative, user-supplied field that drives both the
// NCLEXBase renderer and the Telegram poll — never inferred or guessed (an
// unrecognized or missing type is a validation error, not a fallback).
//
// The three required types are priority, sata, and bowtie:
//   - priority: always exactly one correct answer ("choose the best/first
//     action" — a single best choice among up to ~5 options).
//   - sata: always a "select all that apply" multi-answer format.
//   - bowtie: a structurally different three-section format (see
//     RawBowtieSection) with no single options/correctAnswer list at all —
//     "bowtie" is its own SlideFormat, not derived like the others.
// There is deliberately no "standard" type. The remaining entries are
// carried over from the broader NCLEX category list for the image-only
// workflow and behave like single-answer questions unless noted.
export const TYPE_FORMAT: Record<string, SlideFormat> = {
  priority: "single",
  sata: "multiple",
  multiple_choice: "single",
  multiple_response: "multiple",
  select_all: "multiple",
  first_action: "single",
  next_action: "single",
  best_action: "single",
  delegation: "single",
  pharmacology: "single",
  patient_teaching: "single",
  safety: "single",
  clinical_judgment: "single",
  lab_value: "single",
  nursing_intervention: "single",
  quick_review: "single",
  key_point: "single",
  nclex_tip: "single",
  ordered_response: "ordered",
  sequence: "ordered",
  calculation: "open",
  bowtie: "bowtie",
};

export const KNOWN_TYPES = Object.keys(TYPE_FORMAT);
