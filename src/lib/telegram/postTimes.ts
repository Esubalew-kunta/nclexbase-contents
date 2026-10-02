import { z } from "zod";

/** The daily posting slots, e.g. ["09:00", "21:00"] means two posts a day. A
 * day can hold one post per slot, so the length of this array *is* the number
 * of posts per day — there is deliberately no separate counter to fall out of
 * sync with the times. */
export const postTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be 24-hour HH:MM, e.g. 09:00");

export const postTimesSchema = z
  .array(postTimeSchema)
  .min(1, "At least one posting time is required")
  .max(6, "At most six posts a day")
  .refine((times) => new Set(times).size === times.length, { message: "Posting times must be unique" });

export const DEFAULT_POST_TIMES = ["09:00", "21:00"];

/** Sorts a validated list into the order they occur in a day, so the admin's
 * input order never affects which slot is "first". */
export function sortPostTimes(times: string[]): string[] {
  return [...times].sort();
}

/** The slot time used for a given index within a day, clamped so an index past
 * the end of the list reuses the last slot rather than producing "undefined". */
export function slotTimeAt(postTimes: string[], index: number): string | null {
  const sorted = sortPostTimes(postTimes);
  if (sorted.length === 0) return null;
  return sorted[Math.min(index, sorted.length - 1)];
}

export function postsPerDay(postTimes: string[]): number {
  return postTimes.length;
}
