import { z } from "zod";

// Structural shape only. Semantic rules (correctAnswer must reference a real
// option, labels must be unique, etc.) live in normalize.ts where we can
// produce messages that name the question and the exact problem.
export const rawOptionSchema = z.object({
  label: z.string().min(1, "option label cannot be empty"),
  text: z.string().min(1, "option text cannot be empty"),
});

export const rawBowtieSectionSchema = z.object({
  options: z.array(rawOptionSchema).min(1, "a bowtie section needs at least one option"),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
});

export const rawQuestionSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  instructions: z.string().optional(),
  question: z.string().min(1, "question text is required"),
  options: z.array(rawOptionSchema).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  explanation: z.string().optional(),
  optionRationales: z.record(z.string(), z.string()).optional(),
  keyPoint: z.string().optional(),
  notes: z.string().optional(),
  actionsToTake: rawBowtieSectionSchema.optional(),
  conditionMostLikely: rawBowtieSectionSchema.optional(),
  parametersToMonitor: rawBowtieSectionSchema.optional(),
});

export const rawQuestionsFileSchema = z.union([
  rawQuestionSchema,
  z.array(rawQuestionSchema).min(1, "the JSON array is empty"),
]);

export type RawQuestionParsed = z.infer<typeof rawQuestionSchema>;
export type RawBowtieSectionParsed = z.infer<typeof rawBowtieSectionSchema>;
