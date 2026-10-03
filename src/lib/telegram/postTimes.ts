import { z } from "zod";

/** The single time of day every post goes out. Both (or all) of a day's posts
 *  share it, which is why the count is its own setting rather than implied by
 *  the length of a list of times. */
export const postTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be 24-hour HH:MM, e.g. 09:00");

export const postsPerDaySchema = z
  .number()
  .int("Posts per day must be a whole number")
  .min(1, "At least one post a day")
  .max(6, "At most six posts a day");

/** Shifts a post's UTC timestamp by whole seconds so two posts sharing one
 *  wall-clock time are still distinct, ordered rows.
 *
 *  The admin asked for every post of the day to go out at the same time, and
 *  they do — the calendar and the dashboard both display HH:MM, so a 30-second
 *  offset is invisible. It exists only so the two rows have different
 *  `scheduled_at` values: the publisher claims due posts ordered by that
 *  column, and without a tiebreak "which one is slot 1" is arbitrary. */
export const SLOT_STAGGER_SECONDS = 30;

export const DEFAULT_POST_TIME = "19:00";
export const DEFAULT_POSTS_PER_DAY = 2;

export function sortPostTimes(times: string[]): string[] {
  return [...times].sort();
}

/** How many posts a single day may hold, clamped into the legal range so a
 *  hand-edited or legacy settings row can never disable scheduling entirely.
 *  Junk falls back to the default rather than coercing: `Number(null)` and
 *  `Number("")` are both 0, which would silently mean "one post a day" instead
 *  of "we don't know". */
export function clampPostsPerDay(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return DEFAULT_POSTS_PER_DAY;
  if (typeof value === "string" && value.trim() === "") return DEFAULT_POSTS_PER_DAY;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_POSTS_PER_DAY;
  return Math.min(6, Math.max(1, Math.round(n)));
}

/** The UTC instant for `slotIndex`-th post of a day, at wall-clock `time`.
 *  Always returns a fixed time-of-day; `dateStr` is interpreted in the
 *  settings' own timezone by the caller before this is applied. */
export function slotStaggerMs(slotIndex: number): number {
  return Math.max(0, slotIndex) * SLOT_STAGGER_SECONDS * 1000;
}